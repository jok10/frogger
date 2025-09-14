export class Car {
	constructor(deps, laneIndex, speed, dir, colorRGBA) {
		this.gl = deps.gl;
		this.vPosition = deps.vPosition;
		this.colorLoc = deps.colorLoc;
		this.laneYMid = deps.laneYMid;
		this.makeCarQuad = deps.makeCarQuad;
		this.flatten = deps.flatten;
		this.speedScale = deps.speedScale ?? 1.0;

		this.k = laneIndex;
		this.speed = speed;   // base lane speed
		this.dir = dir;
		this.color = colorRGBA || this.randomColor();

		const startX = (this.dir > 0) ? -1.2 : 1.2;
		const y = this.laneYMid(this.k);

		this.vertices = this.makeCarQuad(startX, y);
		this.buffer = this.gl.createBuffer();
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, this.flatten(this.vertices), this.gl.DYNAMIC_DRAW);
	}

	updateAndUpload(dt) {
		const gl = this.gl;

		const dx = this.speed * this.speedScale * this.dir * (dt * 60);
		for (let i = 0; i < this.vertices.length; i++) this.vertices[i][0] += dx;

		let minX = this.vertices[0][0], maxX = this.vertices[0][0];
		for (let i = 1; i < this.vertices.length; i++) {
			const x = this.vertices[i][0];
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
		}

		if (maxX < -1.1 && this.dir < 0) {
			const shift = 2.4 + Math.random() * 0.15;
			for (let i = 0; i < this.vertices.length; i++) this.vertices[i][0] += shift;
			this.color = this.randomColor();
		} else if (minX > 1.1 && this.dir > 0) {
			const shift = -2.4 - Math.random() * 0.15;
			for (let i = 0; i < this.vertices.length; i++) this.vertices[i][0] += shift;
			this.color = this.randomColor();
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flatten(this.vertices));
	}

	randomColor() {
		for (;;) {
			const r = Math.random();
			const g = Math.random();
			const b = Math.random();
			const min = Math.min(r, g, b);
			const max = Math.max(r, g, b);
			if (max - min > 0.3) return [r, g, b, 1.0];
		}
	}

	draw() {
		const gl = this.gl;
		gl.uniform4fv(this.colorLoc, new Float32Array(this.color));
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.vertexAttribPointer(this.vPosition, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
	}
}
