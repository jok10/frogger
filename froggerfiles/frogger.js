import { Car as CarClass } from './car.js';

const sidewalkHeight = 0.20;
const totalRoadHeight = 1.50;
const laneHeight = totalRoadHeight / 5.0;
const ROAD_Y0 = -1.0 + sidewalkHeight;
const LANE_MARGIN = 0.02;
const MAX_CARS_PER_LANE = 2;

const TOP_GOAL_Y = ROAD_Y0 + totalRoadHeight;
const BOTTOM_GOAL_Y = ROAD_Y0 + 0.05;
const MAX_SCORE = 10;

const CAR_W = 0.18;
const CAR_H = 0.22;

const SPEED_SCALE = 3;

var canvas, gl, vertices, bufferId, vPosition, colorLoc;
var lane0Verts, lane0Buffer, lane1Verts, lane1Buffer, lane2Verts, lane2Buffer;
var lane3Verts, lane3Buffer, lane4Verts, lane4Buffer;
var facingUp = true;
var score = 0;
var goingToTop = true;
var FROG_START;
var scoreLines = [];
var scoreBuffer;
var gameOver = false;
var cars = [];

function laneYLow(k){ return ROAD_Y0 + k * laneHeight; }
function laneYHigh(k){ return laneYLow(k) + laneHeight; }
function laneYMid(k){ return (laneYLow(k) + laneYHigh(k)) * 0.5; }
function frogTipY(){ return vertices[1][1]; }
function makeCarQuad(cx, cy){
	const hw = CAR_W * 0.5, hh = CAR_H * 0.5;
	return [
		vec2(cx - hw, cy - hh),
		vec2(cx - hw, cy + hh),
		vec2(cx + hw, cy + hh),
		vec2(cx + hw, cy - hh)
	];
}
function makeStrip(y0, y1){
	return [ vec2(-1, y0), vec2(-1, y1), vec2(1, y1), vec2(1, y0) ];
}
function flipFrog(currentPosition){
	let trianglePoint = currentPosition[1][1];
	currentPosition[1][1] = currentPosition[0][1];
	currentPosition[0][1] = trianglePoint;
	currentPosition[2][1] = currentPosition[0][1];
}
function findBoundary(verts){
	let minX = verts[0][0], maxX = verts[0][0];
	let minY = verts[0][1], maxY = verts[0][1];
	for (let i = 1; i < verts.length; i++){
		const x = verts[i][0], y = verts[i][1];
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	return {minX, maxX, minY, maxY};
}
function updateScoreLines(){
	scoreLines = [];
	let x = -0.95;
	const step = 0.04;
	const y0 = 0.85, y1 = 0.95;
	for (let i = 0; i < score && i < 10; i++){
		scoreLines.push(vec2(x, y0), vec2(x, y1));
		x += step;
	}
	gl.bindBuffer(gl.ARRAY_BUFFER, scoreBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(scoreLines), gl.STATIC_DRAW);
}
function detectOverlap(a, b){
	if (a.maxX < b.minX) return false;
	if (a.minX > b.maxX) return false;
	if (a.maxY < b.minY) return false;
	if (a.minY > b.maxY) return false;
	return true;
}
function randIn(a, b){ return a + Math.random() * (b - a); }

// Slower ranges + global scale
const laneConfig = [
	{ dir:+1, minDelay:1200, maxDelay:2200, speedMin:0.004,  speedMax:0.007  },
	{ dir:-1, minDelay:1200, maxDelay:2200, speedMin:0.004,  speedMax:0.0075 },
	{ dir:+1, minDelay:1100, maxDelay:2000, speedMin:0.0035, speedMax:0.0065 },
	{ dir:-1, minDelay:1100, maxDelay:2000, speedMin:0.0035, speedMax:0.0068 },
	{ dir:+1, minDelay:1200, maxDelay:2200, speedMin:0.004,  speedMax:0.007  }
];
for (let k = 0; k < laneConfig.length; k++){
	const cfg = laneConfig[k];
	cfg.speed = randIn(cfg.speedMin, cfg.speedMax) * SPEED_SCALE;
}

// Overlap-safe spawn window around edge (blocks cars just inside/outside)
function laneHasRoom(laneIndex, dir){
	const spawnEdge = (dir > 0) ? -1.2 : 1.2;
	const minGap = CAR_W * 2.0;
	const leftBound  = spawnEdge - minGap;
	const rightBound = spawnEdge + minGap;
	for (let c of cars){
		if (c.k !== laneIndex) continue;
		const box = findBoundary(c.vertices);
		const front = (c.dir > 0) ? box.maxX : box.minX;
		if (front >= leftBound && front <= rightBound) return false;
	}
	return true;
}

function spawnCarInLane(CarClass, deps, laneIndex){
	let count = 0; for (let c of cars) if (c.k === laneIndex) count++;
	if (count >= MAX_CARS_PER_LANE) return;
	const cfg = laneConfig[laneIndex];
	if (laneHasRoom(laneIndex, cfg.dir)) cars.push(new CarClass(deps, laneIndex, cfg.speed, cfg.dir));
}

function resetFrog(){
	vertices[0][0] = FROG_START[0][0]; vertices[0][1] = FROG_START[0][1];
	vertices[1][0] = FROG_START[1][0]; vertices[1][1] = FROG_START[1][1];
	vertices[2][0] = FROG_START[2][0]; vertices[2][1] = FROG_START[2][1];
	facingUp = true;
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferSubData(gl.ARRAY_BUFFER, 0, flatten(vertices));
}

window.onload = function init() {
	canvas = document.getElementById("gl-canvas");
	gl = WebGLUtils.setupWebGL(canvas);
	if (!gl) return;

	gl.viewport(0, 0, canvas.width, canvas.height);
	gl.clearColor(0.8, 0.8, 0.8, 1.0);

	const program = initShaders(gl, "vertex-shader", "fragment-shader");
	gl.useProgram(program);
	colorLoc = gl.getUniformLocation(program, "uColor");

	vertices = [ vec2(-0.06, -0.92), vec2(0.00, -0.84), vec2(0.06, -0.92) ];
	FROG_START = [ vec2(vertices[0][0], vertices[0][1]), vec2(vertices[1][0], vertices[1][1]), vec2(vertices[2][0], vertices[2][1]) ];

	bufferId = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(vertices), gl.DYNAMIC_DRAW);

	vPosition = gl.getAttribLocation(program, "vPosition");
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(vPosition);

	window.addEventListener("keydown", function(e){
		if (gameOver) return;
		let xmove = 0.0, ymove = 0.0;
		switch(e.keyCode){
			case 37: xmove = -0.11; break;
			case 39: xmove =  0.11; break;
			case 38: if (!facingUp) { flipFrog(vertices); facingUp = true; } ymove = -0.11; break;
			case 40: if (facingUp) { flipFrog(vertices); facingUp = false; } ymove =  0.09; break;
			default: return;
		}
		for (let i = 0; i < vertices.length; i++){
			vertices[i][0] += xmove;
			vertices[i][1] -= ymove;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, flatten(vertices));
	});

	lane0Verts = makeStrip(laneYLow(0) + LANE_MARGIN, laneYHigh(0) - LANE_MARGIN);
	lane0Buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, lane0Buffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(lane0Verts), gl.STATIC_DRAW);

	lane1Verts = makeStrip(laneYLow(1) + LANE_MARGIN, laneYHigh(1) - LANE_MARGIN);
	lane1Buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, lane1Buffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(lane1Verts), gl.STATIC_DRAW);

	lane2Verts = makeStrip(laneYLow(2) + LANE_MARGIN, laneYHigh(2) - LANE_MARGIN);
	lane2Buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, lane2Buffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(lane2Verts), gl.STATIC_DRAW);

	lane3Verts = makeStrip(laneYLow(3) + LANE_MARGIN, laneYHigh(3) - LANE_MARGIN);
	lane3Buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, lane3Buffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(lane3Verts), gl.STATIC_DRAW);

	lane4Verts = makeStrip(laneYLow(4) + LANE_MARGIN, laneYHigh(4) - LANE_MARGIN);
	lane4Buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, lane4Buffer);
	gl.bufferData(gl.ARRAY_BUFFER, flatten(lane4Verts), gl.STATIC_DRAW);

	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);

	scoreBuffer = gl.createBuffer();
	updateScoreLines();

	const deps = { gl, vPosition, colorLoc, laneYMid, makeCarQuad, flatten };

	const laneColors = [
		[0.90, 0.25, 0.25, 1],
		[0.25, 0.55, 0.95, 1],
		[0.25, 0.80, 0.30, 1],
		[0.95, 0.65, 0.20, 1],
		[0.75, 0.35, 0.85, 1]
	];

	cars.push(new CarClass(deps, 0, laneConfig[0].speed, laneConfig[0].dir, laneColors[0]));
	cars.push(new CarClass(deps, 1, laneConfig[1].speed, laneConfig[1].dir, laneColors[1]));
	cars.push(new CarClass(deps, 2, laneConfig[2].speed, laneConfig[2].dir, laneColors[2]));
	cars.push(new CarClass(deps, 3, laneConfig[3].speed, laneConfig[3].dir, laneColors[3]));
	cars.push(new CarClass(deps, 4, laneConfig[4].speed, laneConfig[4].dir, laneColors[4]));

	for (let k = 0; k < 5; k++){
		const cfg = laneConfig[k];
		const schedule = () => {
			const delay = Math.floor(randIn(cfg.minDelay, cfg.maxDelay));
			setTimeout(() => {
				if (gameOver) return;
				spawnCarInLane(CarClass, deps, k);
				schedule();
			}, delay);
		};
		schedule();
	}

	window.requestAnimFrame(render);
};

function render(t){
	if (typeof render.lastTime === "undefined") render.lastTime = t;
	let dt = (t - render.lastTime) / 1000;
	render.lastTime = t;
	if (dt > 0.1) dt = 0.1;

	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.uniform4fv(colorLoc, new Float32Array([0.68, 0.68, 0.68, 1]));
	gl.bindBuffer(gl.ARRAY_BUFFER, lane0Buffer);
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

	gl.uniform4fv(colorLoc, new Float32Array([0.62, 0.62, 0.62, 1]));
	gl.bindBuffer(gl.ARRAY_BUFFER, lane1Buffer);
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

	gl.uniform4fv(colorLoc, new Float32Array([0.66, 0.66, 0.66, 1]));
	gl.bindBuffer(gl.ARRAY_BUFFER, lane2Buffer);
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

	gl.uniform4fv(colorLoc, new Float32Array([0.60, 0.60, 0.60, 1]));
	gl.bindBuffer(gl.ARRAY_BUFFER, lane3Buffer);
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

	gl.uniform4fv(colorLoc, new Float32Array([0.64, 0.64, 0.64, 1]));
	gl.bindBuffer(gl.ARRAY_BUFFER, lane4Buffer);
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

	for (let c of cars){
		c.updateAndUpload(dt);
		c.draw();
	}

	if (scoreLines.length > 0){
		gl.uniform4fv(colorLoc, new Float32Array([0, 0, 0, 1]));
		gl.bindBuffer(gl.ARRAY_BUFFER, scoreBuffer);
		gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.LINES, 0, scoreLines.length);
	}

	const frogBox = findBoundary(vertices);
	let collided = false;
	for (let c of cars){
		if (detectOverlap(frogBox, findBoundary(c.vertices))) { collided = true; break; }
	}
	if (collided){
		score = 0;
		goingToTop = true;
		updateScoreLines();
		resetFrog();
	}

	gl.uniform4fv(colorLoc, new Float32Array([0.25, 0.65, 0.25, 1]));
	gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
	gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_FAN, 0, vertices.length);

	const tipY = frogTipY();
	if (goingToTop && tipY >= TOP_GOAL_Y) {
		score++;
		goingToTop = false;
		updateScoreLines();
	} else if (!goingToTop && tipY <= BOTTOM_GOAL_Y) {
		score++;
		goingToTop = true;
		updateScoreLines();
	}

	if (score >= MAX_SCORE) { gameOver = true; return; }
	window.requestAnimFrame(render);
}
