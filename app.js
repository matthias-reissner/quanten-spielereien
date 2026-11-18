(function () {
  "use strict";

  const Game = window.MorrisGame;
  const board = document.querySelector("#board");
  const linesLayer = board.querySelector(".board-lines");
  const pointsLayer = board.querySelector(".board-points");
  const SVG_NS = "http://www.w3.org/2000/svg";
  const RINGS = [60, 150, 240];
  const state = {
    game: Game.createState(),
    busy: false,
    difficulty: "medium",
    epoch: 0,
    circuitId: 0,
    circuit: emptyCircuit(0)
  };
  let drawnCircuitId = -1;

  function pointCoordinates(point) {
    const ring = Math.floor(point / 8);
    const offset = point % 8;
    const edge = RINGS[ring];
    const coordinates = [
      [edge, edge], [300, edge], [600 - edge, edge], [600 - edge, 300],
      [600 - edge, 600 - edge], [300, 600 - edge], [edge, 600 - edge], [edge, 300]
    ];
    return coordinates[offset];
  }

  function drawBoard() {
    for (let ring = 0; ring < 3; ring += 1) {
      const edge = RINGS[ring];
      const corners = [
        [edge, edge, 600 - edge, edge],
        [600 - edge, edge, 600 - edge, 600 - edge],
        [600 - edge, 600 - edge, edge, 600 - edge],
        [edge, 600 - edge, edge, edge]
      ];
      corners.forEach((coordinates) => addLine(coordinates));
    }
    for (const offset of [1, 3, 5, 7]) {
      addLine([...pointCoordinates(offset), ...pointCoordinates(offset + 8)]);
      addLine([...pointCoordinates(offset + 8), ...pointCoordinates(offset + 16)]);
    }

    for (let point = 0; point < 24; point += 1) {
      const [x, y] = pointCoordinates(point);
      const group = document.createElementNS(SVG_NS, "g");
      group.classList.add("point");
      group.setAttribute("data-point", point);
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      group.setAttribute("aria-label", `Punkt ${point + 1}, frei`);

      const hit = document.createElementNS(SVG_NS, "circle");
      hit.classList.add("point-hit");
      hit.setAttribute("cx", x);
      hit.setAttribute("cy", y);
      hit.setAttribute("r", "23");
      const center = document.createElementNS(SVG_NS, "circle");
      center.classList.add("point-center");
      center.setAttribute("cx", x);
      center.setAttribute("cy", y);
      center.setAttribute("r", "7");
      const piece = document.createElementNS(SVG_NS, "circle");
      piece.classList.add("piece");
      piece.setAttribute("cx", x);
      piece.setAttribute("cy", y);
      piece.setAttribute("r", "13");
      group.append(hit, center, piece);
      group.addEventListener("click", () => handlePoint(point));
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handlePoint(point);
        }
      });
      pointsLayer.appendChild(group);
    }
  }

  function addLine(coordinates) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", coordinates[0]);
    line.setAttribute("y1", coordinates[1]);
    line.setAttribute("x2", coordinates[2]);
    line.setAttribute("y2", coordinates[3]);
    linesLayer.appendChild(line);
  }

  function humanActions() {
    return Game.getLegalActions(state.game);
  }

  function handlePoint(point) {
    if (state.busy || state.game.over || state.game.turn !== "W") return;
    const actions = humanActions();
    if (state.game.capturePending) {
      const capture = actions.find((action) => action.position === point);
      if (capture) state.game = Game.applyAction(state.game, capture);
      render();
      maybePlayAI();
      return;
    }

    if (state.game.placed.W < 9) {
      const placement = actions.find((action) => action.type === "place" && action.to === point);
      if (placement) {
        state.game = Game.applyAction(state.game, placement);
        render();
        maybePlayAI();
      }
      return;
    }

    const occupant = state.game.board[point];
    const selected = Number.isInteger(state.selected) ? state.selected : null;
    if (occupant === "W") {
      state.selected = selected === point ? null : point;
      render();
      return;
    }
    if (selected !== null) {
      const move = actions.find((action) => action.type === "move" && action.from === selected && action.to === point);
      if (move) {
        state.selected = null;
        state.game = Game.applyAction(state.game, move);
        render();
        maybePlayAI();
      }
    }
  }

  function maybePlayAI() {
    if (state.game.over || state.game.turn !== "B" || state.game.capturePending || state.busy) return;
    state.busy = true;
    const epoch = state.epoch;
    render();
    (async () => {
      try {
        let action = await chooseWithCircuit(state.game, epoch);
        if (epoch !== state.epoch) return;
        if (!action) throw new Error("Der Quantenschaltkreis hat keinen legalen Zug ausgewählt.");

        let selection = describeAction(action);
        state.game = Game.applyAction(state.game, action);
        if (state.game.capturePending) {
          const capture = await chooseWithCircuit(state.game, epoch);
          if (epoch !== state.epoch) return;
          if (!capture) throw new Error("Der Quantenschaltkreis hat keinen legalen Schlagzug ausgewählt.");
          selection += ` und schlägt auf Punkt ${capture.position + 1}`;
          state.game = Game.applyAction(state.game, capture);
        }

        state.busy = false;
        state.circuit.status = "ZUG AUSGEWÄHLT";
        state.circuit.caption = `Der simulierte Quantenschaltkreis wählte: Die KI ${selection}.`;
        state.circuit.progress = `${state.circuit.progress} · abgeschlossen`;
        render();
      } catch (error) {
        if (epoch !== state.epoch) return;
        state.busy = false;
        state.circuit.status = "FEHLER";
        state.circuit.progress = "Schaltkreis abgebrochen";
        state.circuit.caption = error instanceof Error ? error.message : String(error);
        render();
        console.error("Quantum circuit simulation failed:", error);
      }
    })();
  }

  function chooseWithCircuit(game, epoch) {
    return window.QuantumMorrisAI.chooseAction(game, state.difficulty, (progress) => {
      if (epoch !== state.epoch) return false;
      updateCircuit(progress);
      renderCircuit();
      return true;
    });
  }

  function emptyCircuit(id) {
    return {
      id,
      gates: [],
      qubits: 0,
      candidateCount: 0,
      markedCount: 0,
      iterations: 0,
      activeGate: -1,
      status: "BEREIT",
      progress: "Noch kein Schaltkreis ausgeführt.",
      caption: "Warte auf den nächsten KI-Zug."
    };
  }

  function updateCircuit(progress) {
    if (progress.type === "start") {
      state.circuit = {
        id: ++state.circuitId,
        gates: progress.gates,
        qubits: progress.qubits,
        dimension: progress.dimension,
        candidateCount: progress.candidateCount,
        markedCount: progress.markedCount,
        iterations: progress.iterations,
        difficulty: progress.difficulty,
        activeGate: -1,
        status: "INITIALISIERT",
        progress: `${progress.qubits} Qubits · ${progress.dimension} Basiszustände`,
        caption: `${progress.candidateCount} legale Züge; ${progress.markedCount} markierte Kandidaten.`
      };
    } else if (progress.type === "gate") {
      state.circuit.activeGate = progress.gateIndex;
      state.circuit.status = `GATTER ${progress.gateIndex + 1}/${progress.gateCount}`;
      state.circuit.progress = `${gateName(progress.gate)} · Lauf ${progress.attempt} · P(Ziel) ${(progress.targetProbability * 100).toFixed(1)} %`;
      state.circuit.caption = "Der Statevector wird nach jedem Gatter aktualisiert.";
    } else if (progress.type === "measurement") {
      state.circuit.status = progress.target ? "ZIEL GEMESSEN" : "POSTSELEKTION";
      state.circuit.progress = `Messung |${binaryState(progress.measuredIndex, state.circuit.qubits)}⟩ · p ${(progress.probability * 100).toFixed(1)} %`;
      state.circuit.caption = progress.target
        ? "Die Messung ergab einen markierten Zug."
        : "Der Messwert ist kein markierter Zug; der Schaltkreis wird erneut ausgeführt.";
    } else if (progress.type === "retry") {
      state.circuit.activeGate = -1;
      state.circuit.status = `NEUER LAUF ${progress.attempt}`;
      state.circuit.progress = "Postselektion: ungültiger oder nicht markierter Zustand";
      state.circuit.caption = "Der Quantenschaltkreis startet mit demselben Zugregister erneut.";
    } else if (progress.type === "result") {
      state.circuit.status = "ZUG GEMESSEN";
      state.circuit.progress = `Index ${progress.selectedIndex} · p ${(progress.probability * 100).toFixed(1)} %`;
      state.circuit.caption = `Gemessener Kandidat: Die KI ${describeAction(progress.action)}.`;
    }
  }

  function describeAction(action) {
    if (action.type === "place") return `setzt einen Stein auf Punkt ${action.to + 1}`;
    if (action.type === "move") return `zieht von Punkt ${action.from + 1} zu Punkt ${action.to + 1}`;
    return `schlägt auf Punkt ${action.position + 1}`;
  }

  function gateName(gate) {
    if (gate.type === "ORACLE") return "Phasenorakel O_f";
    if (gate.type === "MCZ") return "Mehrfach-kontrolliertes Z";
    if (gate.type === "M") return `Messung M(q${gate.qubit})`;
    return `${gate.type}(q${gate.qubit})`;
  }

  function binaryState(index, qubits) {
    return index.toString(2).padStart(qubits, "0");
  }

  function drawCircuitDiagram() {
    const svg = document.querySelector("#circuit-diagram");
    svg.replaceChildren();
    const circuit = state.circuit;
    if (circuit.qubits === 0 || circuit.gates.length === 0) {
      svg.setAttribute("viewBox", "0 0 500 90");
      svg.setAttribute("width", "500");
      svg.setAttribute("height", "90");
      svg.appendChild(svgElement("text", { x: "250", y: "50", class: "circuit-empty" }, "Der Quantenschaltkreis erscheint beim KI-Zug."));
      return;
    }

    const rowGap = 40;
    const firstY = 35;
    const left = 64;
    const columnGap = 38;
    const width = left + circuit.gates.length * columnGap + 24;
    const height = firstY + (circuit.qubits - 1) * rowGap + 38;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);

    for (let qubit = 0; qubit < circuit.qubits; qubit += 1) {
      const y = firstY + qubit * rowGap;
      svg.appendChild(svgElement("text", { x: "7", y: y + 4, class: "qubit-label" }, `q${qubit}`));
      svg.appendChild(svgElement("text", { x: "33", y: y + 4, class: "basis-label" }, "|0⟩"));
      svg.appendChild(svgElement("line", { x1: "54", y1: y, x2: width - 12, y2: y, class: "qubit-wire" }));
    }

    circuit.gates.forEach((gate, index) => {
      const x = left + index * columnGap + columnGap / 2;
      const group = svgElement("g", {
        class: "gate-column",
        "data-gate-index": index,
        "data-gate-x": x
      });
      group.appendChild(svgElement("title", {}, gateName(gate)));

      if (gate.type === "ORACLE") {
        const top = firstY - 12;
        const oracleHeight = (circuit.qubits - 1) * rowGap + 24;
        group.appendChild(svgElement("rect", { x: x - 13, y: top, width: 26, height: oracleHeight, rx: 4, class: "gate-box oracle-box" }));
        group.appendChild(svgElement("text", { x, y: firstY + ((circuit.qubits - 1) * rowGap) / 2 + 4, class: "gate-text" }, "O_f"));
      } else if (gate.type === "MCZ") {
        const lastY = firstY + (circuit.qubits - 1) * rowGap;
        if (circuit.qubits > 1) {
          group.appendChild(svgElement("line", { x1: x, y1: firstY, x2: x, y2: lastY, class: "gate-control-wire" }));
          for (let qubit = 0; qubit < circuit.qubits - 1; qubit += 1) {
            group.appendChild(svgElement("circle", { cx: x, cy: firstY + qubit * rowGap, r: 4, class: "gate-control" }));
          }
        }
        group.appendChild(svgElement("rect", { x: x - 12, y: lastY - 12, width: 24, height: 24, rx: 3, class: "gate-box" }));
        group.appendChild(svgElement("text", { x, y: lastY + 4, class: "gate-text" }, "Z"));
      } else {
        const y = firstY + gate.qubit * rowGap;
        group.appendChild(svgElement("rect", { x: x - 12, y: y - 12, width: 24, height: 24, rx: 3, class: "gate-box" }));
        group.appendChild(svgElement("text", { x, y: y + 4, class: "gate-text" }, gate.type));
      }
      svg.appendChild(group);
    });
  }

  function svgElement(tagName, attributes, text) {
    const element = document.createElementNS(SVG_NS, tagName);
    Object.keys(attributes).forEach((attribute) => element.setAttribute(attribute, attributes[attribute]));
    if (text) element.textContent = text;
    return element;
  }

  function renderCircuit() {
    if (drawnCircuitId !== state.circuit.id) {
      drawCircuitDiagram();
      drawnCircuitId = state.circuit.id;
      document.querySelector("#circuit-scroll").scrollLeft = 0;
    }
    const svg = document.querySelector("#circuit-diagram");
    svg.querySelectorAll(".gate-column").forEach((gate) => {
      const index = Number(gate.dataset.gateIndex);
      const completed = index < state.circuit.activeGate ||
        (!state.busy && index === state.circuit.activeGate && state.circuit.status === "ZUG AUSGEWÄHLT");
      gate.classList.toggle("completed", completed);
      gate.classList.toggle("active", index === state.circuit.activeGate && state.busy);
    });
    document.querySelector("#circuit-candidate-count").textContent = state.circuit.candidateCount || "–";
    document.querySelector("#circuit-qubits").textContent = state.circuit.qubits || "–";
    document.querySelector("#circuit-gate-count").textContent = state.circuit.gates.length || "–";
    document.querySelector("#circuit-marked-count").textContent = state.circuit.markedCount || "–";
    document.querySelector("#circuit-iterations").textContent = state.circuit.iterations;
    document.querySelector("#circuit-progress").textContent = state.circuit.progress;
    const status = document.querySelector("#circuit-status");
    status.textContent = state.circuit.status;
    status.classList.toggle("live", state.busy && state.circuit.status !== "FEHLER");
    document.querySelector("#circuit-caption").textContent = state.circuit.caption;
    document.querySelector("#difficulty").disabled = state.busy;

    if (state.circuit.activeGate >= 0) {
      const active = svg.querySelector(`[data-gate-index="${state.circuit.activeGate}"]`);
      const scroller = document.querySelector("#circuit-scroll");
      if (active) {
        const gateX = Number(active.dataset.gateX);
        if (gateX > scroller.scrollLeft + scroller.clientWidth - 60) {
          scroller.scrollLeft = gateX - scroller.clientWidth + 100;
        }
      }
    }
  }

  function render() {
    const game = state.game;
    const actions = Game.getLegalActions(game);
    const legalTargets = new Set();
    const captureTargets = new Set();
    if (game.capturePending) actions.forEach((action) => captureTargets.add(action.position));
    else if (game.placed.W === 9 && game.turn === "W") {
      actions.forEach((action) => {
        if (action.type === "move" && action.from === state.selected) legalTargets.add(action.to);
      });
    } else if (game.placed.W < 9 && game.turn === "W") {
      actions.forEach((action) => legalTargets.add(action.to));
    }

    pointsLayer.querySelectorAll(".point").forEach((pointElement) => {
      const point = Number(pointElement.dataset.point);
      const piece = game.board[point];
      const pieceElement = pointElement.querySelector(".piece");
      pointElement.classList.toggle("has-piece", piece !== null);
      pointElement.classList.toggle("selected", state.selected === point);
      pointElement.classList.toggle("legal-target", legalTargets.has(point));
      pointElement.classList.toggle("capture-target", captureTargets.has(point));
      pieceElement.classList.toggle("human-piece", piece === "W");
      pieceElement.classList.toggle("ai-piece", piece === "B");
      const label = piece === "W" ? "dein Stein" : piece === "B" ? "Stein der Quanten-KI" : "frei";
      pointElement.setAttribute("aria-label", `Punkt ${point + 1}, ${label}`);
    });

    updatePlayer("human", "W");
    updatePlayer("ai", "B");
    document.querySelector("#human-card").classList.toggle("active", game.turn === "W" && !game.over);
    document.querySelector("#ai-card").classList.toggle("active", game.turn === "B" && !game.over);
    document.querySelector("#human-state").textContent = game.over ? (game.winner === "W" ? "GEWONNEN" : "VERLOREN") : (game.turn === "W" ? "AM ZUG" : "BEREIT");
    document.querySelector("#ai-state").textContent = game.over ? (game.winner === "B" ? "GEWONNEN" : "VERLOREN") : (state.busy ? "DENKT NACH" : (game.turn === "B" ? "AM ZUG" : "BEREIT"));
    document.querySelector("#turn-dot").parentElement.classList.toggle("ai-turn", game.turn === "B" && !game.over);
    document.querySelector("#turn-label").textContent = game.over
      ? (game.winner === "W" ? "Du hast gewonnen!" : "Die Quanten-KI gewinnt.")
      : (game.turn === "W" ? "Du bist am Zug" : (state.busy ? "Die KI denkt nach …" : "Quanten-KI ist am Zug"));
    document.querySelector("#phase-badge").textContent = game.placed.W < 9 || game.placed.B < 9 ? "AUFSTELLEN" : "ZIEHEN";
    document.querySelector("#board-hint").textContent = getHint();
    renderCircuit();
  }

  function updatePlayer(player, color) {
    const onBoard = Game.countPieces(state.game, color);
    const remaining = 9 - state.game.placed[color];
    const available = state.game.placed[color] < 9 ? remaining : onBoard;
    document.querySelector(`#${player}-count`).textContent = available;
    const track = document.querySelector(`#${player}-track`);
    track.replaceChildren();
    for (let index = 0; index < 9; index += 1) {
      const token = document.createElement("span");
      token.className = "piece-token";
      token.classList.toggle("used", index >= available);
      token.setAttribute("aria-hidden", "true");
      track.appendChild(token);
    }
  }

  function getHint() {
    const game = state.game;
    if (game.over) return "Starte ein neues Spiel für eine Revanche.";
    if (state.busy) return "Die KI wägt ihre Möglichkeiten ab.";
    if (game.turn === "B") return "Die Quanten-KI ist am Zug.";
    if (game.capturePending) return "Mühle! Wähle einen gegnerischen Stein.";
    if (game.placed.W < 9) return "Setze einen Stein auf einen freien Punkt.";
    if (Game.countPieces(game, "W") === 3) return "Wähle einen Stein und springe auf ein freies Feld.";
    if (Number.isInteger(state.selected)) return "Wähle einen verbundenen, freien Punkt.";
    return "Wähle einen deiner Steine zum Ziehen.";
  }

  document.querySelector("#new-game").addEventListener("click", () => {
    state.epoch += 1;
    state.game = Game.createState();
    state.selected = null;
    state.busy = false;
    state.circuit = emptyCircuit(++state.circuitId);
    render();
  });
  document.querySelector("#rules-toggle").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    document.querySelector("#rules-panel").hidden = expanded;
  });
  document.querySelector("#difficulty").addEventListener("change", (event) => {
    state.difficulty = event.currentTarget.value;
    const descriptions = {
      easy: "Misst gleichverteilt aus allen legalen Zügen.",
      medium: "Verstärkt gute Züge mit Grover-Iterationen.",
      hard: "Bewertet Antworten voraus und verstärkt beste Züge."
    };
    document.querySelector("#difficulty-description").textContent = descriptions[state.difficulty];
    renderCircuit();
  });

  drawBoard();
  render();
})();
