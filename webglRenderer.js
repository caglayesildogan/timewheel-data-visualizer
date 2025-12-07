(function() {
  'use strict';

  const canvas = document.getElementById('glCanvas');
  const gl = canvas.getContext('webgl', { antialias: true });
  const width = 600;
  const height = 600;
  const centerX = width / 2;
  const centerY = height / 2;

  // support High-DPI displays
  const DPR = window.devicePixelRatio || 1;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = Math.floor(width * DPR);
  canvas.height = Math.floor(height * DPR);

  // Ensure canvas internal pixel size matches our drawing resolution
  canvas.width = width;
  canvas.height = height;

  if (!gl) {
    alert('WebGL nicht verfügbar');
    throw new Error('WebGL nicht verfügbar');
  }

  // Enable alpha blending
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Shader Source Code
  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec4 a_color;
    varying vec4 v_color;
    uniform vec2 u_resolution;
    
    void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 clipSpace = zeroToOne * 2.0 - 1.0;
        gl_Position = vec4(clipSpace.x, -clipSpace.y, 0, 1);
        v_color = a_color;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying vec4 v_color;
    
    void main() {
        gl_FragColor = v_color;
    }
  `;

  // Shader compilation helper
  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader Kompilierungsfehler:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  // Create and link the shader program
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Shader Program Linkfehler:', gl.getProgramInfoLog(program));
    throw new Error('Shader Program konnte nicht erstellt werden');
  }

  // Use the program
  gl.useProgram(program);

  // Attribute and Uniform Locations
  const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
  const colorAttributeLocation = gl.getAttribLocation(program, 'a_color');
  const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');

  // Position and Color Buffers
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();

  // allocate reasonably large dynamic buffers once (bytes)
  const BUFFER_SIZE = 256 * 1024;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, BUFFER_SIZE, gl.DYNAMIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, BUFFER_SIZE, gl.DYNAMIC_DRAW);

  const MAX_VERTICES = 65536;

  // === LINE BATCH RENDERING ===
  // Collect line segments to be drawn in this buffer (once per frame)
  let lineBuffer = {
    vertices: [],
    colors: [],
    indices: []
  };

  function addLineToBuffer(x1, y1, x2, y2, color, width = 2.0) {
    // Calculate direction and perpendicular vector
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    
    // Calculate offset for line width
    const cosa = Math.cos(angle);
    const sina = Math.sin(angle);
    const wx = (width / 2) * sina;
    const wy = (width / 2) * cosa;
    
    // Vertex positions for the quad
    const v1 = [x1 - wx, y1 + wy];
    const v2 = [x1 + wx, y1 - wy];
    const v3 = [x2 - wx, y2 + wy];
    const v4 = [x2 + wx, y2 - wy];

    // Triangle A: v1, v2, v3
    // Triangle B: v2, v4, v3
    lineBuffer.vertices.push(...v1, ...v2, ...v3, ...v2, ...v4, ...v3);

    // Add color for each vertex
    for (let i = 0; i < 6; i++) {
      lineBuffer.colors.push(...color);
    }

    // Add indices for the two triangles
    const startIndex = (lineBuffer.vertices.length / 2) - 6;
    lineBuffer.indices.push(startIndex, startIndex + 1, startIndex + 2, startIndex + 3, startIndex + 4, startIndex + 5);
  }

  // Flush the line buffer and draw all lines
  function flushLineBuffer() {
    if (lineBuffer.vertices.length === 0) return;
    
    const vertexArray = new Float32Array(lineBuffer.vertices);
    const colorArray = new Float32Array(lineBuffer.colors);
    
    // Update Position Buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexArray.byteLength, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexArray);
    
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Update Color Buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorArray.byteLength, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, colorArray);
    
    gl.enableVertexAttribArray(colorAttributeLocation);
    gl.vertexAttribPointer(colorAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    
    gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
    
    // Draw the lines 
    gl.drawArrays(gl.TRIANGLES, 0, lineBuffer.vertices.length / 2);
    
    // Clear the buffer after drawing
    lineBuffer.vertices = [];
    lineBuffer.colors = [];
    lineBuffer.indices = [];
  }

  // Draw a filled circle at (x, y) with given radius
  function drawCircle(x, y, radius) {
    const segments = 32;
    const vertices = new Float32Array(segments * 3 * 2);
    
    for (let i = 0; i < segments; i++) {
      const angle1 = (i / segments) * Math.PI * 2;
      const angle2 = ((i + 1) / segments) * Math.PI * 2;
      
      vertices[i * 6] = x;
      vertices[i * 6 + 1] = y;
      
      vertices[i * 6 + 2] = x + Math.cos(angle1) * radius;
      vertices[i * 6 + 3] = y + Math.sin(angle1) * radius;
      
      vertices[i * 6 + 4] = x + Math.cos(angle2) * radius;
      vertices[i * 6 + 5] = y + Math.sin(angle2) * radius;
    }
    
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
    
    gl.drawArrays(gl.TRIANGLES, 0, segments * 3);
  }

  // Expose the renderer interface
  window.webglRenderer = {
    getContext: () => gl,
    getCanvas: () => canvas,
    getWidth: () => width,
    getHeight: () => height,
    getCenterX: () => centerX,
    getCenterY: () => centerY,
    getDPR: () => DPR,
    addLineToBuffer,
    flushLineBuffer,
    drawCircle,
    getLineBuffer: () => lineBuffer
  };

})();
