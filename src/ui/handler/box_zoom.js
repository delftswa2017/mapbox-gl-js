'use strict';

const DOM = require('../../util/dom');
const LngLatBounds = require('../../geo/lng_lat_bounds');
const util = require('../../util/util');
const window = require('../../util/window');
const shaders = require('../../render/shaders');
const ProgramConfiguration = require('../../data/program_configuration');
const browser = require('../../util/browser');
const glmatrix = require('@mapbox/gl-matrix');

const vec4 = glmatrix.vec4,
mat4 = glmatrix.mat4,
mat2 = glmatrix.mat2

/**
 * The `BoxZoomHandler` allows the user to zoom the map to fit within a bounding box.
 * The bounding box is defined by clicking and holding `shift` while dragging the cursor.
 *
 * @param {Map} map The Mapbox GL JS map to add the handler to.
 */
class BoxZoomHandler {

    constructor(map) {
        this._map = map;
        this._el = map.getCanvasContainer();
        this._canvas=map.getCanvas();
        this._container = map.getContainer();

        util.bindAll([
            '_onMouseDown',
            '_onMouseMove',
            '_onMouseUp',
            '_onKeyDown'
        ], this);
    }

    /**
     * Returns a Boolean indicating whether the "box zoom" interaction is enabled.
     *
     * @returns {boolean} `true` if the "box zoom" interaction is enabled.
     */
    isEnabled() {
        return !!this._enabled;
    }

    /**
     * Returns a Boolean indicating whether the "box zoom" interaction is active, i.e. currently being used.
     *
     * @returns {boolean} `true` if the "box zoom" interaction is active.
     */
    isActive() {
        return !!this._active;
    }

    /**
     * Enables the "box zoom" interaction.
     *
     * @example
     *   map.boxZoom.enable();
     */
    enable() {
        if (this.isEnabled()) return;
        this._el.addEventListener('mousedown', this._onMouseDown, false);
        this._enabled = true;
    }

    /**
     * Disables the "box zoom" interaction.
     *
     * @example
     *   map.boxZoom.disable();
     */
    disable() {
        if (!this.isEnabled()) return;
        this._el.removeEventListener('mousedown', this._onMouseDown);
        this._enabled = false;
    }

    _onMouseDown(e) {
        if (!(e.shiftKey && e.button === 0)) return;

        window.document.addEventListener('mousemove', this._onMouseMove, false);
        window.document.addEventListener('keydown', this._onKeyDown, false);
        window.document.addEventListener('mouseup', this._onMouseUp, false);

        DOM.disableDrag();
        this._startPos = DOM.mousePos(this._el, e);
        this._active = true;
    }

    _onMouseMove(e) {
        const p0 = this._startPos,
            p1 = DOM.mousePos(this._el, e);

        if (!this.box1) {
            this._container.classList.add('mapboxgl-crosshair');
            this._fireEvent('boxzoomstart', e);
            this.box1 = DOM.create('div', 'mapboxgl-boxzoom', this._container);
            this.box1.style.width = "10px"
            this.box1.style.height = "10px"
            this.box2 = DOM.create('div', 'mapboxgl-boxzoom', this._container);
            this.box2.style.width = "30px"
            this.box2.style.height = "30px"
            this.box3 = DOM.create('div', 'mapboxgl-boxzoom', this._container);
            this.box3.style.width = "40px"
            this.box3.style.height = "40px"
            this.box4 = DOM.create('div', 'mapboxgl-boxzoom', this._container);
            this.box4.style.width = "20px"
            this.box4.style.height = "20px"
        }
        const minX = Math.min(p0.x, p1.x),
            maxX = Math.max(p0.x, p1.x),
            minY = Math.min(p0.y, p1.y),
            maxY = Math.max(p0.y, p1.y);

        var p0ll = this._map.unproject(p0),
        p1ll = this._map.unproject(p1),
        n = Math.max(p0ll.lat,p1ll.lat),
        s = Math.min(p0ll.lat,p1ll.lat),
        e = Math.max(p0ll.lng,p1ll.lng),
        w = Math.min(p0ll.lng,p1ll.lng),
        nw = this._map.project({lat:n,lng:w}),
        se = this._map.project({lat:s,lng:e}),
        sw = this._map.project({lat:s,lng:w}),
        ne = this._map.project({lat:n,lng:e});
        // ===============================================
        // TODO draw the box with webgl in this._canvas
        var gl = this._canvas.getContext("experimental-webgl");
        gl.viewport(0, 0, this._canvas.width, this._canvas.height);
        // gl.clearColor(0, 0, 0, 1);
        // gl.clear(gl.COLOR_BUFFER_BIT);

        // const definition = shaders['fill'];
        const definition = shaders.fill;
        var configuration = new ProgramConfiguration();
        configuration.addUniform('color',"u_color");
        configuration.addUniform('opacity','u_opacity');
        let definesSource = `#define MAPBOX_GL_JS\n#define DEVICE_PIXEL_RATIO ${browser.devicePixelRatio.toFixed(1)}\n`;
        const fragmentSource = configuration.applyPragmas(definesSource + shaders.prelude.fragmentSource + definition.fragmentSource, 'fragment');
        const vertexSource = configuration.applyPragmas(definesSource + shaders.prelude.vertexSource + definition.vertexSource, 'vertex');

        var vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertexSource);
        gl.compileShader(vs);


        var fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragmentSource);
        gl.compileShader(fs);
        var program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        var aspect = this._canvas.width / this._canvas.height;
        //
        var vertices = new Float32Array([
          2*ne.x/this._canvas.height-1,2*aspect*ne.y/this._canvas.height-1,
          2*nw.x/this._canvas.height-1,2*aspect*nw.y/this._canvas.height-1,
          2*se.x/this._canvas.height-1,2*aspect*se.y/this._canvas.height-1,
          2*sw.x/this._canvas.height-1,2*aspect*sw.y/this._canvas.height-1
        ]);

        var vbuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        var itemSize = 2;
        var numItems = vertices.length / itemSize;
        gl.useProgram(program);

        program.uColor = gl.getUniformLocation(program, "u_color");
        gl.uniform4f(program.uColor, 0.0, 0.3, 0.0, 1.0);
        program.uOpacity = gl.getUniformLocation(program, "u_opacity");
        gl.uniform1f(program.uOpacity, 1);
        program.uMatrix = gl.getUniformLocation(program, "u_matrix");
        gl.uniformMatrix4fv(program.uMatrix, false, mat4.identity(new Float64Array(16)));


        program.aVertexPosition = gl.getAttribLocation(program, "a_pos");
        gl.enableVertexAttribArray(program.aVertexPosition);
        gl.vertexAttribPointer(program.aVertexPosition, itemSize, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, numItems);
        // ===============================================

        DOM.setTransform(this.box1,`translate(${nw.x}px,${nw.y}px)`)
        DOM.setTransform(this.box2,`translate(${se.x}px,${se.y}px)`)
        DOM.setTransform(this.box3,`translate(${sw.x}px,${sw.y}px)`)
        DOM.setTransform(this.box4,`translate(${ne.x}px,${ne.y}px)`)
        // console.log(`nw ${nw.y} ${nw.x}`);
        // console.log(`sw ${sw.y} ${sw.x}`);
        // console.log(`se ${se.y} ${se.x}`);
        // console.log(`ne ${ne.y} ${ne.x}`);



        const rotz = this._map.transform.angle * 360/6.28,
        rotx = this._map.transform._pitch * 360/6.28;

    }

    _onMouseUp(e) {
        if (e.button !== 0) return;

        const p0 = this._startPos,
            p1 = DOM.mousePos(this._el, e),
            bounds = new LngLatBounds()
                .extend(this._map.unproject(p0))
                .extend(this._map.unproject(p1));

        this._finish();

        if (p0.x === p1.x && p0.y === p1.y) {
            this._fireEvent('boxzoomcancel', e);
        } else {
            // this._map
            //     .fitBounds(bounds, {linear: true})
            //     .fire('boxzoomend', { originalEvent: e, boxZoomBounds: bounds });
        }
    }

    _onKeyDown(e) {
        if (e.keyCode === 27) {
            this._finish();
            this._fireEvent('boxzoomcancel', e);
        }
    }

    _finish() {
        this._active = false;

        window.document.removeEventListener('mousemove', this._onMouseMove, false);
        window.document.removeEventListener('keydown', this._onKeyDown, false);
        window.document.removeEventListener('mouseup', this._onMouseUp, false);

        this._container.classList.remove('mapboxgl-crosshair');

        if (this._box) {
            this._box.parentNode.removeChild(this._box);
            this._box = null;
            this.box1.parentNode.removeChild(this.box1);
            this.box2.parentNode.removeChild(this.box2);
            this.box3.parentNode.removeChild(this.box3);
            this.box4.parentNode.removeChild(this.box4);
            // this.ccanvas.parentNode.removeChild(this.ccanvas);
            // this.ccanvas = null;
        }

        DOM.enableDrag();
    }

    _fireEvent(type, e) {
        return this._map.fire(type, { originalEvent: e });
    }
}

module.exports = BoxZoomHandler;

/**
 * @typedef {Object} MapBoxZoomEvent
 * @property {MouseEvent} originalEvent
 * @property {LngLatBounds} boxZoomBounds The bounding box of the "box zoom" interaction.
 *   This property is only provided for `boxzoomend` events.
 */

/**
 * Fired when a "box zoom" interaction starts. See [`BoxZoomHandler`](#BoxZoomHandler).
 *
 * @event boxzoomstart
 * @memberof Map
 * @instance
 * @property {MapBoxZoomEvent} data
 */

/**
 * Fired when a "box zoom" interaction ends.  See [`BoxZoomHandler`](#BoxZoomHandler).
 *
 * @event boxzoomend
 * @memberof Map
 * @instance
 * @type {Object}
 * @property {MapBoxZoomEvent} data
 */

/**
 * Fired when the user cancels a "box zoom" interaction, or when the bounding box does not meet the minimum size threshold.
 * See [`BoxZoomHandler`](#BoxZoomHandler).
 *
 * @event boxzoomcancel
 * @memberof Map
 * @instance
 * @property {MapBoxZoomEvent} data
 */
