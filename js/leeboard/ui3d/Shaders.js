/* 
 * Copyright 2017 Albert Santos.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

define(['three', 'lbutil'],
function(THREE, LBUtil) {
    
/**
 * Stuff for working with GPB shaders
 * @exports LBShaders
 */
var LBShaders = LBShaders || {};


/**
 * Helper for creating a texture with an initial color and alpha value.
 * @param {Number} width    The width of the texture.
 * @param {Number} height   The height of the texture.
 * @param {module:LBGeometry.Color} [color] If defined the initial color for the pixels, otherwise it is set to black.
 * @param {Number} [alpha=1]  If defined the initial alpha value for the pixels.
 * @returns {THREE.DataTexture} The {@link https://threejs.org/docs/index.html#api/textures/DataTexture|THREE.DataTexture} texture.
 */
LBShaders.createDataTexture = function(width, height, color, alpha) {
    var data = new Float32Array(width * height * 4);
    var p = 0;
    var r = 0;
    var g = 0;
    var b = 0;
    var a = LBUtil.isVar(alpha) ? alpha : 1;
    if (color) {
        r = color.r;
        g = color.g;
        b = color.b;
    }
    for (var i = 0; i < width; ++i) {
        for (var j = 0; j < height; ++j) {
            data[p++] = r;
            data[p++] = g;
            data[p++] = b;
            data[p++] = a;
        }
    }
    
    var texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
};


/**
 * Class that helps with managing shader based computations.
 * <p>
 * Originally based upon ThreeJS' {@link https://github.com/mrdoob/three.js/blob/dev/examples/js/GPUComputationRenderer.js|examples/GPUComputationRenderer.js}
 * <p>
 * The computer works by performing shader operations on a texture, the data to be
 * computed and the result are stored in textures, which are basically a gridWidth X gridHeight
 * set of 4 floats (RGBA values).
 * <p>
 * The typical compute operation is performed in a fragment shader. The fragment shader will
 * normally declare a uniform sampler2D representing the input texture values. The output of
 * the fragment shader is the output texture.
 * <p>
 * The computer maintains two {@link https://threejs.org/docs/index.html#api/renderers/WebGLRenderTarget|THREE.WebGLRenderTarget}
 * objects, a current one accessed via {@link module:LBShaders.Computer#getCurrentRenderTarget} and previous
 * one accessed via {@link module:LBShaders.Computer#getPreviousRenderTarget}. The current render target
 * is the one that receives the output of the shaders when the computations are performed.
 * Often, the output of the computations serves as the input to the next round of computations,
 * to simplify this {@link module:LBShaders.Computer#swapRenderTargets} can be called to swap the
 * current and previous objects.
 * <p>
 * In order to actually do anything, shaders must be defined. 
 * {@link https://threejs.org/docs/index.html#api/materials/ShaderMaterial|THREE.ShaderMaterial} objects are used to 
 * define the shaders.
 * <p>
 * To pass the previous render target's data (texture) to the shader, you need to assign
 * the texture of the render target to the appropriate uniform used by the shader.
 * Once the uniforms for the shader material have been set up, {@link module:LBShaders.Computer#applyShader} is
 * called with the shader material passed in as the argument. After the call the output
 * of the computation will be in the texture of the current render target.
 * <p>
 * @constructor
 * @param {Number} gridWidth    The width of the compute grid.
 * @param {Number} gridHeight   The height of the compute grid.
 * @param {THREE.WebGLRenderer} [renderer]    The {@link https://threejs.org/docs/index.html#api/renderers/WebGLRenderer|THREE.WebGLRenderer} renderer to use.
 * @param {THREE.Camera}    [camera]    The camera to use.
 * @returns {module:LBShaders.Computer}
 */
LBShaders.Computer = function(gridWidth, gridHeight, renderer, camera) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    
    this.renderer = renderer || new THREE.WebGLRenderer();
    
    this.scene = new THREE.Scene();
    if (camera) {
        this.camera = camera;
    }
    else {
        this.camera = new THREE.Camera();
        this.camera.position.z = 1;
    }
    
    var wrapS = THREE.ClampToEdgeWrapping;
    var wrapT = THREE.ClampToEdgeWrapping;

    var minFilter = THREE.NearestFilter;
    var magFilter = THREE.NearestFilter;
    var targetOptions = {
        wrapS: wrapS,
        wrapT: wrapT,
        minFilter: minFilter,
        magFilter: magFilter,
        format: THREE.RGBAFormat,
        type: ( /(iPad|iPhone|iPod)/g.test( navigator.userAgent ) ) ? THREE.HalfFloatType : THREE.FloatType,
        stencilBuffer: false

    };
    
    this.currentTarget = new THREE.WebGLRenderTarget(gridWidth, gridHeight, targetOptions);
    this.previousTarget = new THREE.WebGLRenderTarget(gridWidth, gridHeight, targetOptions);
    
    this.passThroughMaterial = new THREE.ShaderMaterial({
        uniforms: {
            texture: { value: null }
        },
        vertexShader: this.getPassThroughVertexShader(),
        fragmentShader: this.getPassThroughFragmentShader()
    });
    this.setupUniforms(this.passThroughMaterial.uniforms);
    
    this.passThroughMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry( 2, 2 ), this.passThroughMaterial);
    this.scene.add(this.passThroughMesh);
};

var _savedColor;

LBShaders.Computer.prototype = {
    /**
     * Helper for creating an appropriately sized texture for use with the computer, the
     * values of texture are initialized to 0,0,0,1.
     * @param {module:LBGeometry.Color} [color] If defined the initial color for the pixels, otherwise it is set to black.
     * @param {Number} [alpha=1]  If defined the initial alpha value for the pixels.
     * @returns {THREE.DataTexture} The {@link https://threejs.org/docs/index.html#api/textures/DataTexture|THREE.DataTexture} texture.
     */
    createShaderTexture: function(color, alpha) {
        return LBShaders.createDataTexture(this.gridWidth, this.gridHeight, color, alpha);
    },
    
    /**
     * Creates up the uniforms used by the pass through shaders returned by
     * {@link module:LBShaders.Computer#getPassThroughVertexShader} and {@link module:LBShaders.Computer#getPassThroughFragmentShader}.
     * @param {Object} uniforms The uniforms to be set up.
     * @returns {module:LBShaders.Computer}    this.
     */
    setupUniforms: function(uniforms) {
        uniforms.gridSize = { value: new THREE.Vector2(this.gridWidth, this.gridHeight) };
        uniforms.gridNorm = { value: new THREE.Vector2(1 / (this.gridWidth - 1), 1 / (this.gridHeight - 1)) };
        uniforms.cellSize = { value: new THREE.Vector2(1 / this.gridWidth, 1 / this.gridHeight) };
        return this;
    },
    
    /**
     * Swaps the current and previous render target objects.
     * @returns {module:LBShaders.Computer}    this.
     */
    swapRenderTargets : function() {
        var tmp = this.currentTarget;
        this.currentTarget = this.previousTarget;
        this.previousTarget = tmp;
        return this;
    },
    
    /**
     * Initializes the values of a compute texture to a single color and alpha value.
     * @param {THREE.DataTexture} texture   The {@link https://threejs.org/docs/index.html#api/texture/DataTexture|THREE.DataTexture} texture to initialize.
     * @param {THREE.Color} [color]   The color to set each value to, if not defined
     * the clear color of the computer's renderer will be used.
     * @param {Number} [alpha]  If defined the alpha value to assign to each value, otherwise
     * the clear alpha value of the computer's renderer will be used. Only used of color is defined.
     * @returns {module:LBShaders.Computer}    this.
     */
    clearTexture: function(texture, color, alpha) {
        var savedAlpha = this.renderer.getClearAlpha();
        if (alpha === undefined) {
            alpha = savedAlpha;
        }
        if (color !== undefined) {
            _savedColor = LBUtil.copyOrClone(_savedColor, this.renderer.getClearColor());
            this.renderer.setClearColor(color, alpha);
        }
        
        this.passThroughMaterial.uniforms.texture.value = texture;
        this.renderer.clearTarget(this.currentTarget, true, false, false);
        
        if (color !== undefined) {
            this.renderer.setClearColor(_savedColor, savedAlpha);
        }
        return this;
    },
    
    /**
     * Helper for initializing the current render target's texture using the pass through
     * shaders.
     * @param {THREE.DataTexture} texture   The {@link https://threejs.org/docs/index.html#api/texture/DataTexture|THREE.DataTexture} texture to assign.
     * @returns {module:LBShaders.Computer}    this.
     */
    applyTexture: function(texture) {
        this.passThroughMaterial.uniforms.texture.value = texture;
        this.renderer.render(this.scene, this.camera, this.currentTarget);
        this.passThroughMaterial.uniforms.texture.value = null;
        return this;
    },
    
    /**
     * The main compute function, this renders a shader material to the current render target.
     * @param {THREE.ShaderMaterial} shaderMaterial The {@link https://threejs.org/docs/index.html#api/materials/ShaderMaterial|THREE.ShaderMaterial} shader material to be rendered. This
     * material defines the shaders to be run. The uniforms for the shaders should be set up
     * as required before this call.
     * @returns {module:LBShaders.Computer}    this.
     */
    applyShader: function(shaderMaterial) {
        this.passThroughMesh.material = shaderMaterial;
        this.renderer.render(this.scene, this.camera, this.currentTarget);
        this.passThroughMesh.material = this.passThroughMaterial;
        return this;
    },
    
    /**
     * @returns {THREE.WebGLRenderTarget}   The current {@link https://threejs.org/docs/index.html#api/renderers/WebGLRenderTarget|THREE.WebGLRenderTarget} render target, this receives
     * the output of the renderer calls in {@link module:LBShaders.Computer#applyShader} and
     * {@linnk LBShaders.Computer#applyTexture}.
     */
    getCurrentRenderTarget: function() {
        return this.currentTarget;
    },
    
    
    /**
     * @returns {THREE.WebGLRenderTarget}   The previous {@link https://threejs.org/docs/index.html#api/renderers/WebGLRenderTarget|THREE.WebGLRenderTarget} render target.
     */
    getPreviousRenderTarget: function() {
        return this.previousTarget;
    },
    
    /**
     * @returns {Array} The vertex shader code for our pass-through vertex shader.
     */
    getPassThroughVertexShader: function() {
        return passThroughVertexShader;
    },
    
    /**
     * @returns {Array} The fragment shader code for our pass-through vertex shader.
     */
    getPassThroughFragmentShader: function() {
        return passThroughFragmentShader;
    },
    
    destroy: function() {
        if (this.renderer) {
            this.currentTarget.dispose();
            this.currentTarget = null;
            
            this.previousTarget.dispose();
            this.previousTarget = null;
            
            this.scene.remove(this.passThroughMesh);
            this.passThroughMesh.dispose();
            this.passThroughMesh = null;
            
            this.scene.dispose();
            this.scene = null;

            this.passThroughMaterial.dispose();
            this.passThroughMaterial = null;

            this.renderer = null;
        }
    },
    
    constructor: LBShaders.Computer
};

/**
 * Helper for determining if the shader computer is supported.
 * @param {THREE.WebGLRenderer} [renderer]    The {@link https://threejs.org/docs/index.html#api/renderers/WebGLRenderer|THREE.WebGLRenderer} renderer.
 * @returns {Boolean}   true if we think the computer will work.
 */
LBShaders.Computer.isSupported = function(renderer) {
    var renderer = renderer || new THREE.WebGLRenderer();
    if (!(renderer instanceof THREE.WebGLRenderer)) {
        return false;
    }
    
    if (!renderer.extensions.get( "OES_texture_float" )) {
        return false;
    }

    return true;
};

/**
 * A simple helper for copying the texture from one render target to another.
 * @constructor
 * @param {THREE.WebGLRenderer} renderer    The {@link https://threejs.org/docs/index.html#api/renderers/WebGLRenderer|THREE.WebGLRenderer} renderer.
 * @returns {module:LBShaders.TargetCopier}
 */
LBShaders.TargetCopier = function(renderer) {
    this.renderer = renderer;
    
    this.scene = new THREE.Scene();
    this.material = new THREE.ShaderMaterial({
        uniforms: {
            texture: { value: null }
        },
        vertexShader: passThroughVertexShader,
        fragmentShader: passThroughFragmentShader
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry( 2, 2 ), this.material);
    this.scene.add(this.mesh);

    this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
};

LBShaders.TargetCopier.prototype = {
    copyTarget: function(srcTarget, dstTarget) {
        this.material.uniforms.texture.value = srcTarget.texture;
        this.renderer.render(this.scene, this.camera, dstTarget, true);
    },
    
    constructor: LBShaders.TargetCopier
};

//
// Some shader notes:
// position is from -1 to 1, which corresponds to the 2x2 mesh used.
// gl_Position is from -1 to 1, top right corner of display is 1,1
// gl_FragCoord ranges from 0.5 to gridSize - 0.5.
// uvCoord ranges from 0 to 1

var passThroughVertexShader = [
    // Adapted from https://github.com/evanw/webgl-water/blob/master/water.js
    'varying vec2 uvCoord;',
    'void main() {',
    '   uvCoord = position.xy * 0.5 + 0.5;',
    '   gl_Position = vec4(position.xyz, 1.0);',
    '}'
].join('\n');

var passThroughFragmentShader = [
    'uniform sampler2D texture;',
    'varying vec2 uvCoord;',
    'void main() {',
    '   gl_FragColor = texture2D(texture, uvCoord);',
    
'gl_FragColor.r = (uvCoord.x > 0.5) && (uvCoord.y < 0.51) ? 1. : gl_FragColor.r;',
    
    '}'
    
].join('\n');


return LBShaders;
});
