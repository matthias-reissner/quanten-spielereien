(function (root) {
  "use strict";

  const Game = root.MorrisGame;

  function openMillCount(state, color) {
    let count = 0;
    for (const mill of Game.MILLS) {
      const own = mill.filter((point) => state.board[point] === color).length;
      const empty = mill.filter((point) => state.board[point] === null).length;
      if (own === 2 && empty === 1) count += 1;
    }
    return count;
  }

  function evaluate(state, perspective) {
    const enemy = Game.opponent(perspective);
    if (state.over) return state.winner === perspective ? 10000 : -10000;

    const ownCount = Game.countPieces(state, perspective);
    const enemyCount = Game.countPieces(state, enemy);
    let score = (ownCount - enemyCount) * 55;
    score += (state.placed[perspective] - state.placed[enemy]) * 3;
    score += (openMillCount(state, perspective) - openMillCount(state, enemy)) * 12;

    if (state.placed[perspective] === 9 && ownCount === 3) score += 12;
    if (state.placed[enemy] === 9 && enemyCount === 3) score -= 12;

    const ownMobility = state.turn === perspective
      ? Game.getLegalActions(state).length
      : 0;
    const enemyState = { ...state, turn: enemy, capturePending: false, over: false };
    const enemyMobility = state.placed[enemy] === 9
      ? Game.getLegalActions(enemyState).length
      : 0;
    score += (ownMobility - enemyMobility) * 0.7;
    return score;
  }

  function resolveTurn(state, action) {
    let result = Game.applyAction(state, action);
    if (!result.capturePending) return result;

    const color = state.turn;
    let bestCapture = null;
    let bestScore = -Infinity;
    for (const capture of Game.getLegalActions(result)) {
      const candidate = Game.applyAction(result, capture);
      const score = evaluate(candidate, color);
      if (score > bestScore) {
        bestScore = score;
        bestCapture = candidate;
      }
    }
    return bestCapture || result;
  }

  function search(state, depth, alpha, beta, perspective) {
    if (depth === 0 || state.over) return evaluate(state, perspective);

    const actions = Game.getLegalActions(state);
    if (actions.length === 0) return evaluate(state, perspective);

    const maximizing = state.turn === perspective;
    let best = maximizing ? -Infinity : Infinity;
    for (const action of actions) {
      const next = resolveTurn(state, action);
      const score = search(next, depth - 1, alpha, beta, perspective);
      if (maximizing) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, score);
        beta = Math.min(beta, best);
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function rankedCandidates(state, options, difficulty) {
    if (difficulty === "easy") return options.map((_, index) => index);

    const color = state.turn;
    const scored = options.map((action, index) => ({
      index,
      score: difficulty === "hard"
        ? search(resolveTurn(state, action), 2, -Infinity, Infinity, color)
        : evaluate(resolveTurn(state, action), color)
    })).sort((a, b) => b.score - a.score);

    if (difficulty === "hard") {
      return scored.filter((candidate) => candidate.score === scored[0].score).map((candidate) => candidate.index);
    }

    return scored
      .filter((candidate, index) => index < 6 && candidate.score >= scored[0].score - 24)
      .map((candidate) => candidate.index);
  }

  function buildGates(qubits, iterations) {
    const gates = [];
    for (let qubit = 0; qubit < qubits; qubit += 1) gates.push({ type: "H", qubit });

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      gates.push({ type: "ORACLE" });
      for (let qubit = 0; qubit < qubits; qubit += 1) gates.push({ type: "H", qubit });
      for (let qubit = 0; qubit < qubits; qubit += 1) gates.push({ type: "X", qubit });
      gates.push({ type: "MCZ" });
      for (let qubit = 0; qubit < qubits; qubit += 1) gates.push({ type: "X", qubit });
      for (let qubit = 0; qubit < qubits; qubit += 1) gates.push({ type: "H", qubit });
    }

    for (let qubit = 0; qubit < qubits; qubit += 1) gates.push({ type: "M", qubit });
    return gates;
  }

  function applyHadamard(amplitudes, qubit) {
    const step = 1 << qubit;
    const scale = 1 / Math.sqrt(2);
    for (let base = 0; base < amplitudes.length; base += step * 2) {
      for (let offset = 0; offset < step; offset += 1) {
        const zero = base + offset;
        const one = zero + step;
        const a = amplitudes[zero];
        const b = amplitudes[one];
        amplitudes[zero] = (a + b) * scale;
        amplitudes[one] = (a - b) * scale;
      }
    }
  }

  function applyX(amplitudes, qubit) {
    const step = 1 << qubit;
    for (let base = 0; base < amplitudes.length; base += step * 2) {
      for (let offset = 0; offset < step; offset += 1) {
        const zero = base + offset;
        const one = zero + step;
        const amplitude = amplitudes[zero];
        amplitudes[zero] = amplitudes[one];
        amplitudes[one] = amplitude;
      }
    }
  }

  function applyGate(amplitudes, gate, markedIndexes) {
    if (gate.type === "H") applyHadamard(amplitudes, gate.qubit);
    else if (gate.type === "X") applyX(amplitudes, gate.qubit);
    else if (gate.type === "ORACLE") {
      markedIndexes.forEach((index) => { amplitudes[index] *= -1; });
    } else if (gate.type === "MCZ") {
      amplitudes[amplitudes.length - 1] *= -1;
    }
  }

  function simulateStatevector(qubits, markedIndexes, iterations) {
    const amplitudes = new Float64Array(1 << qubits);
    amplitudes[0] = 1;
    for (const gate of buildGates(qubits, iterations)) applyGate(amplitudes, gate, markedIndexes);
    return Array.from(amplitudes, (amplitude) => amplitude * amplitude);
  }

  function sample(probabilities) {
    let remaining = Math.random();
    for (let index = 0; index < probabilities.length; index += 1) {
      remaining -= probabilities[index];
      if (remaining <= 0) return index;
    }
    return probabilities.length - 1;
  }

  function markedProbability(amplitudes, markedIndexes) {
    return markedIndexes.reduce((sum, index) => sum + amplitudes[index] * amplitudes[index], 0);
  }

  function bestIterationCount(dimension, markedCount) {
    if (markedCount >= dimension / 2) return 0;
    const angle = Math.asin(Math.sqrt(markedCount / dimension));
    return Math.max(0, Math.round(Math.PI / (4 * angle) - 0.5));
  }

  async function chooseAction(state, difficulty, onProgress) {
    const options = Game.getLegalActions(state);
    if (options.length === 0) return null;

    const markedIndexes = rankedCandidates(state, options, difficulty);
    const qubits = Math.max(1, Math.ceil(Math.log2(options.length)));
    const dimension = 1 << qubits;
    const iterations = bestIterationCount(dimension, markedIndexes.length);
    const gates = buildGates(qubits, iterations);
    const markedSet = new Set(markedIndexes);

    async function report(progress) {
      if (onProgress && await onProgress(progress) === false) return false;
      if (onProgress) await new Promise((resolve) => root.setTimeout(resolve, 28));
      return true;
    }

    if (!await report({
      type: "start",
      gates,
      qubits,
      dimension,
      candidateCount: options.length,
      markedCount: markedIndexes.length,
      markedIndexes: markedIndexes.slice(),
      iterations,
      difficulty
    })) return null;

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      if (attempt > 1 && !await report({ type: "retry", attempt })) return null;
      const amplitudes = new Float64Array(dimension);
      amplitudes[0] = 1;

      for (let gateIndex = 0; gateIndex < gates.length; gateIndex += 1) {
        const gate = gates[gateIndex];
        applyGate(amplitudes, gate, markedIndexes);
        if (!await report({
          type: "gate",
          gateIndex,
          gate,
          gateCount: gates.length,
          attempt,
          targetProbability: markedProbability(amplitudes, markedIndexes)
        })) return null;
      }

      const probabilities = Array.from(amplitudes, (amplitude) => amplitude * amplitude);
      const measuredIndex = sample(probabilities);
      if (!await report({
        type: "measurement",
        measuredIndex,
        probability: probabilities[measuredIndex],
        target: markedSet.has(measuredIndex) && measuredIndex < options.length,
        attempt
      })) return null;

      if (measuredIndex < options.length && markedSet.has(measuredIndex)) {
        const action = options[measuredIndex];
        if (!await report({
          type: "result",
          selectedIndex: measuredIndex,
          action,
          probability: probabilities[measuredIndex],
          attempt
        })) return null;
        return action;
      }
    }

    throw new Error("Der Simulator hat nach 20 Messungen keinen markierten Zug gefunden.");
  }

  root.QuantumMorrisAI = { chooseAction, simulateStatevector };
})(globalThis);
