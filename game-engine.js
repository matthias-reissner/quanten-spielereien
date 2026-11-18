(function (root) {
  "use strict";

  const RING_SIZE = 8;
  const POINT_COUNT = 24;
  const MILLS = [];

  for (let ring = 0; ring < 3; ring += 1) {
    for (let side = 0; side < 4; side += 1) {
      const start = ring * RING_SIZE + side * 2;
      MILLS.push([start, start + 1, start + 2]);
    }
  }
  for (const point of [1, 3, 5, 7]) {
    MILLS.push([point, point + RING_SIZE, point + RING_SIZE * 2]);
  }

  const NEIGHBORS = Array.from({ length: POINT_COUNT }, (_, point) => {
    const ring = Math.floor(point / RING_SIZE);
    const offset = point % RING_SIZE;
    const neighbors = [
      ring * RING_SIZE + (offset + 7) % RING_SIZE,
      ring * RING_SIZE + (offset + 1) % RING_SIZE
    ];
    if (offset % 2 === 1) {
      if (ring > 0) neighbors.push(point - RING_SIZE);
      if (ring < 2) neighbors.push(point + RING_SIZE);
    }
    return neighbors;
  });

  function createState() {
    return {
      board: Array(POINT_COUNT).fill(null),
      placed: { W: 0, B: 0 },
      turn: "W",
      capturePending: false,
      over: false,
      winner: null
    };
  }

  function copyState(state) {
    return {
      board: state.board.slice(),
      placed: { W: state.placed.W, B: state.placed.B },
      turn: state.turn,
      capturePending: state.capturePending,
      over: state.over,
      winner: state.winner
    };
  }

  function opponent(color) {
    return color === "W" ? "B" : "W";
  }

  function countPieces(state, color) {
    return state.board.filter((piece) => piece === color).length;
  }

  function isInMill(board, point, color) {
    return MILLS.some((mill) => mill.includes(point) && mill.every((position) => board[position] === color));
  }

  function legalCaptures(state, color) {
    const pieces = [];
    for (let point = 0; point < POINT_COUNT; point += 1) {
      if (state.board[point] === color) pieces.push(point);
    }
    const exposed = pieces.filter((point) => !isInMill(state.board, point, color));
    return exposed.length ? exposed : pieces;
  }

  function getLegalActions(state) {
    if (state.over) return [];
    const color = state.turn;
    if (state.capturePending) {
      return legalCaptures(state, opponent(color)).map((position) => ({ type: "capture", position }));
    }

    const actions = [];
    if (state.placed[color] < 9) {
      for (let to = 0; to < POINT_COUNT; to += 1) {
        if (state.board[to] === null) actions.push({ type: "place", to });
      }
      return actions;
    }

    const canFly = countPieces(state, color) === 3;
    for (let from = 0; from < POINT_COUNT; from += 1) {
      if (state.board[from] !== color) continue;
      for (let to = 0; to < POINT_COUNT; to += 1) {
        if (state.board[to] !== null) continue;
        if (canFly || NEIGHBORS[from].includes(to)) actions.push({ type: "move", from, to });
      }
    }
    return actions;
  }

  function finishTurn(state) {
    state.turn = opponent(state.turn);
    state.capturePending = false;

    const current = state.turn;
    if (state.placed[current] === 9) {
      if (countPieces(state, current) < 3 || getLegalActions(state).length === 0) {
        state.over = true;
        state.winner = opponent(current);
      }
    }
    return state;
  }

  function applyAction(state, action) {
    if (state.over) return copyState(state);
    const next = copyState(state);
    const valid = getLegalActions(next).some((candidate) =>
      candidate.type === action.type &&
      candidate.to === action.to &&
      candidate.from === action.from &&
      candidate.position === action.position
    );
    if (!valid) return next;

    if (action.type === "capture") {
      next.board[action.position] = null;
      return finishTurn(next);
    }

    const color = next.turn;
    if (action.type === "place") {
      next.board[action.to] = color;
      next.placed[color] += 1;
    } else {
      next.board[action.from] = null;
      next.board[action.to] = color;
    }

    if (isInMill(next.board, action.to, color)) {
      next.capturePending = true;
    } else {
      finishTurn(next);
    }
    return next;
  }

  function isMillMove(state, action) {
    if (action.type === "capture") return false;
    const nextBoard = state.board.slice();
    if (action.type === "place") nextBoard[action.to] = state.turn;
    else {
      nextBoard[action.from] = null;
      nextBoard[action.to] = state.turn;
    }
    return isInMill(nextBoard, action.to, state.turn);
  }

  root.MorrisGame = {
    MILLS,
    NEIGHBORS,
    applyAction,
    countPieces,
    createState,
    getLegalActions,
    isInMill,
    isMillMove,
    opponent
  };
})(globalThis);
