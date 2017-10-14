/* 
 * Copyright 2017 albert.
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

define(['lbcamera', 'lbscene3d', 'lbgeometry', 'lbmath', 'lbutil', 'lbspherical'],
function(LBCamera, LBUI3d, LBGeometry, LBMath, LBUtil, LBSpherical) {

    'use strict';


/**
 * Object that defines camera limits.
 * @constructor
 * @returns {LBUI3d.CameraLimits}
 */
LBUI3d.CameraLimits = function() {
    /**
     * The minimum allowed position.
     * @member {LBGeometry.Vector3}
     */
    this.minPos = new LBGeometry.Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

    /**
     * The maximum allowed position.
     * @member {LBGeometry.Vector3}
     */
    this.maxPos = new LBGeometry.Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
    
    /**
     * The allowed range for azimuth degrees.
     * @member {LBMath.DegRange}
     */
    this.azimuthRange = new LBMath.DegRange(-180, 360);
    
    /**
     * The allowed range for altitude degrees.
     * @member {LBMath.DegRange}
     */
    this.altitudeRange = new LBMath.DegRange(-90, 360);
    
    /**
     * The allowed range for rotation degrees.
     * @member {LBMath.DegRange}
     */
    this.rotationRange = new LBMath.DegRange(-180, 360);
};

LBUI3d.CameraLimits.prototype = {
    /**
     * Applies the camera limits to a position and spherical orientation.
     * srcPosition and srcOrientation are not modified unless they are the same as
     * dstPosition and dstOrientation, respectively.
     * @param {LBGeometry.Vector3} srcPosition  The position to be limited if necessary.
     * @param {LBSpherical.Orientation} srcOrientation  The orientation to be limited if necessary.
     * @param {LBGeometry.Vector3} dstPosition  Set to the position, limited if necessary.
     * @param {LBSpherical.Orientation} dstOrientation  Set to the orientation, limited if necessary.
     */
    applyLimits: function(srcPosition, srcOrientation, dstPosition, dstOrientation) {
        dstPosition.set(
                LBMath.clamp(srcPosition.x, this.minPos.x, this.maxPos.x), 
                LBMath.clamp(srcPosition.y, this.minPos.y, this.maxPos.y), 
                LBMath.clamp(srcPosition.z, this.minPos.z, this.maxPos.z));
        dstOrientation.azimuthDeg = this.azimuthRange.clampToRange(srcOrientation.azimuthDeg);
        dstOrientation.altitudeDeg = this.altitudeRange.clampToRange(srcOrientation.altitudeDeg);
        dstOrientation.rotationDeg = this.rotationRange.clampToRange(srcOrientation.rotationDeg);
    },

    constructor: LBUI3d.CameraLimits
};


var _workingPosition = new LBGeometry.Vector3();
var _workingOrientation = new LBSpherical.Orientation();
var _workingVector3 = new LBGeometry.Vector3();
var _workingMatrix4 = new LBGeometry.Matrix4();

/**
 * Base class for an object that controls a camera. Typical camera controllers
 * are associated with an {@link LBGeometry.Object3D}, which we call the target.
 * <p>
 * Camera controllers normally work within the context of an {@link LBUI3d.View3D}.
 * <p>
 * Depending upon the controller the camera may be panned or rotated.
 * <p>
 * The camera controllers are loosely based upon the camera controllers found in ThreeJS's 
 * examples/js/controls folder, such as OrbitControls.js and FirstPersonControls.js.
 * @constructor
 * @param {LBUI3d.CameraLimits} [worldLimits]   Optional limits on the world camera position.
 * @param {LBUI3d.CameraLimits} [localLimits]   Optional limits on the local camera position.
 * @returns {LBUI3d.CameraController}
 */
LBUI3d.CameraController = function(worldLimits, localLimits) {
    /**
     * The world limits applied to the camera position.
     * @member {LBUI3d.CameraLimits}
     */
    this.worldLimits = worldLimits || new LBUI3d.CameraLimits();

    /**
     * The local limits applied to the camera position.
     * @member {LBUI3d.CameraLimits}
     */
    this.localLimits = localLimits || new LBUI3d.CameraLimits();
    
    /**
     * The current camera position in world coordinates.
     * @member {LBGeometry.Vector3}
     */
    this.currentPosition = new LBGeometry.Vector3();
    
    /**
     * The current camera orientation in world coordinates.
     * @member {LBGeometry.Quaternion}
     */
    this.currentQuaternion = new LBGeometry.Quaternion();
    
    /**
     * The current mouse mode.
     * @member {LBUI3d.CameraController.MOUSE_PAN_MODE|LBUI3d.CameraController.MOUSE_ROTATE_MODE}
     */
    this.mouseMode = -1;
    
    /**
     * Enables tracked zooming if true.
     * @member {Boolean}
     */
    this.zoomEnabled = true;
    
    /**
     * The current camera zoom scale.
     * @member {Number}
     */
    this.zoomScale = 1;
    
    /**
     * The minimum camera zoom scale.
     * @member {Number}
     */
    this.minZoomScale = 0.025;
    
    /**
     * The maximum camera zoom scale.
     * @member {Number}
     */
    this.maxZoomScale = 150;
    
    /**
     * The current tracking state.
     * @member {LBUI3d.CameraController.TRACKING_STATE_IDLE|LBUI3d.CameraController.TRACKING_STATE_PAN|LBUI3d.CameraController.TRACKING_STATE_ROTATE|LBUI3d.CameraController.TRACKING_STATE_ZOOM}
     */
    this.trackingState = LBUI3d.CameraController.TRACKING_STATE_IDLE;
};

LBUI3d.CameraController.prototype = {
    constructor: LBUI3d.CameraController
};

/**
 * Sets the target for the controller.
 * @param {LBGeometry.Object3D} target  The target.
 */
LBUI3d.CameraController.prototype.setTarget = function(target) {
    this.target = target;
};

LBUI3d.CameraController.MOUSE_PAN_MODE = 0;
LBUI3d.CameraController.MOUSE_ROTATE_MODE = 1;

LBUI3d.CameraController.TRACKING_STATE_IDLE = 0;
LBUI3d.CameraController.TRACKING_STATE_PAN = 1;
LBUI3d.CameraController.TRACKING_STATE_ROTATE = 2;
LBUI3d.CameraController.TRACKING_STATE_ZOOM = 3;

LBUI3d.CameraController.VIEW_FWD            = 0;
LBUI3d.CameraController.VIEW_FWD_STBD       = 1;
LBUI3d.CameraController.VIEW_STBD           = 2;
LBUI3d.CameraController.VIEW_AFT_STBD       = 3;
LBUI3d.CameraController.VIEW_AFT            = 4;
LBUI3d.CameraController.VIEW_AFT_PORT       = 5;
LBUI3d.CameraController.VIEW_PORT           = 6;
LBUI3d.CameraController.VIEW_FWD_PORT       = 7;
LBUI3d.CameraController.VIEW_UP             = 8;
LBUI3d.CameraController.VIEW_DOWN           = 9;

/**
 * Sets whether the camera mouse event handlers apply a rotation or a panning.
 * @param {LBUI3d.CameraController.MOUSE_PAN_MODE|LBUI3d.CameraController.MOUSE_ROTATE_MODE} mode The mouse mode.
 */
LBUI3d.CameraController.prototype.setMouseMode = function(mode) {
    if (this.mouseMode !== mode) {
        this.mouseMode = mode;
    }
};

/**
 * Sets one of the standard views.
 * @param {Number} view One of the LBUI3d.CameraController.VIEW_x values.
 */
LBUI3d.CameraController.prototype.setStandardView = function(view) {
};

/**
 * Rotates the camera point of view horizontally and/or vertically.
 * @param {Number} horzDeg  The number of degrees to rotate horizontally.
 * @param {Number} vertDeg  The number of degrees to rotate vertically.
 */
LBUI3d.CameraController.prototype.rotatePOVDeg = function(horzDeg, vertDeg) {
    
};

/**
 * Pans the camera point of view horizontall or vertically
 * @param {Number} dx   The amount to pan horizontally.
 * @param {Number} dy   The amount to pan vertically.
 */
LBUI3d.CameraController.prototype.panPOV = function(dx, dy) {
    
};

/**
 * Installs event handlers for the controller in a DOM element. The handlers can be
 * uninstalled by calling {@link LBUI3d.CameraController.prototype.uninstallEventHandlers}.
 * @param {Object} domElement   The DOM element to install the handlers into.
 */
LBUI3d.CameraController.prototype.installEventHandlers = function(domElement) {
    if (this.domElement !== domElement) {
        if (this.domElement) {
            this.uninstallEventHandlers();
        }

        this.domElement = domElement;
        
        if (this.domElement) {
            var me = this;
            this.onWheelFunction = function(event) {
                me.onMouseWheel(event);
            };
            domElement.addEventListener('wheel', this.onWheelFunction, false);
            
            this.onMouseDownFunction = function(event) {
                me.onMouseDown(event);
            };
            domElement.addEventListener('mousedown', this.onMouseDownFunction, false);
            
            this.onTouchStartFunction = function(event) {
                me.onTouchStart(event);
            };
            domElement.addEventListener('touchstart', this.onTouchStartFunction, false);
            
            this.onTouchEndFunction = function(event) {
                me.onTouchEnd(event);
            };
            domElement.addEventListener('touchend', this.onTouchEndFunction, false);
            
            this.onTouchMoveFunction = function(event) {
                me.onTouchMove(event);
            };
            domElement.addEventListener('touchmove', this.onTouchMoveFunction, false);
        }
    }
};

/**
 * Uninstalls any event handlers that were installed by a call to 
 * {@link LBUI3d.CameraController.prototype.installEventHandlers}.
 */
LBUI3d.CameraController.prototype.uninstallEventHandlers = function() {
    this.endTracking();
    
    if (this.domElement) {
        this.domElement.removeEventListener('wheel', this.onWheelFunction, false);
        this.domElement.removeEventListener('mousedown', this.onMouseDownFunction, false);
        this.domElement.removeEventListener('touchstart', this.onTouchStartFunction, false);
        this.domElement.removeEventListener('touchend', this.onTouchEndFunction, false);
        this.domElement.removeEventListener('touchmove', this.onTouchMoveFunction, false);
        
        this.domElement = null;
    }
};

/**
 * Ends any tracking that had be going on via an installed event handler. This can be
 * used to cancel mouse tracking via say the ESC key.
 * @param {Boolean} isCancel    If true tracking should be cancelled.
 */
LBUI3d.CameraController.prototype.endTracking = function(isCancel) {
    if (this.onMouseUpFunction) {
        document.removeEventListener('mouseup', this.onMouseUpFunction, false);
        this.onMouseUpFunction = null;
    }
    if (this.onMouseMoveFunction) {
        document.removeEventListener('mousemove', this.onMouseMoveFunction, false);
        this.onMouseUpFunction = null;
    }

    switch (this.trackingState) {
        case LBUI3d.CameraController.TRACKING_STATE_PAN :
            this.finishPan(isCancel);
            break;
            
        case LBUI3d.CameraController.TRACKING_STATE_ROTATE:
            this.finishRotate(isCancel);
            break;
            
        case LBUI3d.CameraController.TRACKING_STATE_ZOOM :
            this.finishZoom(isCancel);
            break;
    }
    
    this.trackingState = LBUI3d.CameraController.TRACKING_STATE_IDLE;
};

/**
 * Starts tracking, called by the mouse down and on touch event handlers when appropriate.
 * @param {Number} x    The x coordinate to start tracking at.
 * @param {Number} y    The y coordinate to start tracking at.
 * @param {Number} timeStamp    The event time stamp.
 * @param {LBUI3d.CameraController.TRACKING_STATE_PAN|LBUI3d.CameraController.TRACKING_STATE_ROTATE} trackingState  The tracking
 * state to enter.
 * @returns {undefined}
 */
LBUI3d.CameraController.prototype.startTracking = function(x, y, timeStamp, trackingState) {
    this.startX = x;
    this.startY = y;

    this.lastX = this.startX;
    this.lastY = this.startY;
    this.lastT = timeStamp;

    this.deltaX = 0;
    this.deltaY = 0;
    this.deltaT = 0;

    this.trackingState = trackingState;
    
    switch (trackingState) {
        case LBUI3d.CameraController.TRACKING_STATE_PAN :
            this.startPan();
            break;

        case LBUI3d.CameraController.TRACKING_STATE_ROTATE :
            this.startRotate();
            break;
            
        case LBUI3d.CameraController.TRACKING_STATE_ZOOM :
            this.startZoom();
            break;
    }
};

/**
 * Called by the mouse and touch move event handlers to track movements.
 * @param {Number} x    The current x coordinate.
 * @param {Number} y    The current y coordinate.
 * @param {Number} timeStamp    The event time stamp.
 * @returns {undefined}
 */
LBUI3d.CameraController.prototype.performTrack = function(x, y, timeStamp) {
    this.deltaX = x - this.lastX;
    this.deltaY = y - this.lastY;
    this.deltaT = (timeStamp - this.lastT) / 1000;

    switch (this.trackingState) {
        case LBUI3d.CameraController.TRACKING_STATE_PAN :
            this.trackPan(x, y, timeStamp);
            break;

        case LBUI3d.CameraController.TRACKING_STATE_ROTATE :
            this.trackRotate(x, y, timeStamp);
            break;
            
        case LBUI3d.CameraController.TRACKING_STATE_ZOOM :
            this.trackZoom(x, y, timeStamp);
            break;
    }

    this.lastX = x;
    this.lastY = y;
    this.lastT = timeStamp;
};


/**
 * Event handler for mouse wheel events.
 * @protected
 * @param {WheelEvent} event   The mouse wheel event.
 */
LBUI3d.CameraController.prototype.onMouseWheel = function(event) {
    if (this.zoomEnabled) {
        event.preventDefault();
        event.stopPropagation();
        
        this.handleMouseWheel(event);
    }
};

/**
 * Event handler for mouse down events.
 * @protected
 * @param {type} event
 */
LBUI3d.CameraController.prototype.onMouseDown = function(event) {
    event.preventDefault();
    
    if (event.button === 0) {
        // Install our mouse move and up event handlers in the document to effectively capture
        // mouse events.
        if (!this.onMouseMoveFuncion) {
            var me = this;
            this.onMouseMoveFunction = function(event) {
                me.onMouseMove(event);
            };

            document.addEventListener('mousemove', this.onMouseMoveFunction, false);
        }

        if (!this.onMouseUpFuncion) {
            var me = this;
            this.onMouseUpFunction = function(event) {
                me.onMouseUp(event);
            };

            document.addEventListener('mouseup', this.onMouseUpFunction, false);
        }
        
        switch (this.mouseMode) {
            case LBUI3d.CameraController.MOUSE_PAN_MODE :
                this.startTracking(event.clientX, event.clientY, event.timeStamp, LBUI3d.CameraController.TRACKING_STATE_PAN);
                break;

            case LBUI3d.CameraController.MOUSE_ROTATE_MODE :
                this.startTracking(event.clientX, event.clientY, event.timeStamp, LBUI3d.CameraController.TRACKING_STATE_ROTATE);
                break;
        }
    }
};

/**
 * The mouse move event handler used when tracking the mouse.
 * @protected
 * @param {MouseEvent} event    The mouse event.
 */
LBUI3d.CameraController.prototype.onMouseMove = function(event) {
    event.preventDefault();
    
    if ((this.trackingState === LBUI3d.CameraController.TRACKING_STATE_PAN)
     || (this.trackingState === LBUI3d.CameraController.TRACKING_STATE_ROTATE)
     || (this.trackingState === LBUI3d.CameraController.TRACKING_STATE_ZOOM)) {
        this.performTrack(event.clientX, event.clientY, event.timeStamp);
    }
};

/**
 * The mouse up event handler.
 * @protected
 * @param {MouseEvent} event    The mouse event.
 */
LBUI3d.CameraController.prototype.onMouseUp = function(event) {
    event.preventDefault();

    this.endTracking(false);
};

function touchDistance(event) {
    var dx = event.touches[0].pageX - event.touches[1].pageX;
    var dy = event.touches[0].pageY - event.touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The touch start event handler.
 * @protected
 * @param {TouchEvent} event    The touch event.
 */
LBUI3d.CameraController.prototype.onTouchStart = function(event) {
    //event.preventDefault();
    
    switch (event.touches.length) {
        case 1 :
            this.startTracking(event.touches[0].pageX, event.touches[0].pageY, event.timeStamp, 
                LBUI3d.CameraController.TRACKING_STATE_ROTATE);
            break;
            
        case 2 :
            this.startTracking(touchDistance(event), 0, event.timeStamp, LBUI3d.CameraController.TRACKING_STATE_ZOOM);
            break;
            
        case 3 :
            this.startTracking(event.touches[0].pageX, event.touches[0].pageY, event.timeStamp, 
                LBUI3d.CameraController.TRACKING_STATE_PAN);
            break;
    }
};

/**
 * The touch move event handler.
 * @protected
 * @param {TouchEvent} event    The touch event.
 */
LBUI3d.CameraController.prototype.onTouchMove = function(event) {
    event.preventDefault();
    event.stopPropagation();
    
    switch (event.touches.length) {
        case 1 :
        case 3 :
            this.performTrack(event.touches[0].pageX, event.touches[0].pageY, event.timeStamp);
            break;
            
        case 2 :
            this.performTrack(touchDistance(event), 0, event.timeStamp);
            break;
    }
};

/**
 * The touch end event handler.
 * @protected
 * @param {TouchEvent} event    The touch event.
 */
LBUI3d.CameraController.prototype.onTouchEnd = function(event) {
    event.preventDefault();
    
    this.endTracking(false);
};

/**
 * Called to handle mouse wheel events by the mouse wheel event handler.
 * This implementation zooms the camera in and out.
 * @protected
 * @param {WheelEvent} event    The wheel event.
 */
LBUI3d.CameraController.prototype.handleMouseWheel = function(event) {
    if (event.deltaY < 0) {
        this.setZoom(this.zoomScale * 0.75);
    }
    else if (event.deltaY > 0) {
        this.setZoom(this.zoomScale * 1.5);
    }
};

/**
 * Changes the zoom of the camera.
 * @param {Number} zoom The zoom scale.
 */
LBUI3d.CameraController.prototype.setZoom = function(zoom) {
    zoom = LBMath.clamp(zoom, this.minZoomScale, this.maxZoomScale);
    if (zoom !== this.zoomScale) {
        if (this.camera.isPerspectiveCamera) {
            this.camera.zoom = zoom;
            this.camera.updateProjectionMatrix();
        }
        
        this.zoomScale = zoom;
    }
};


/**
 * Called to start zooming.
 * @protected
 */
LBUI3d.CameraController.prototype.startZoom = function() {
    this.startZoomScale = this.zoomScale;
};

/**
 * Called to actively track a zoom.
 * @protected
 * @param {Number} x    The tracked x coordinate.
 * @param {Number} y    The tracked y coordinate.
 * @param {Number} timeStamp    The track event time stamp.
 */
LBUI3d.CameraController.prototype.trackZoom = function(x, y, timeStamp) {
    this.setZoom(this.startZoomScale * x / this.startX);
};

/**
 * Called to finish zoom tracking.
 * @protected
 * @param {Boolean} isCancel    If true the zoom should be cancelled.
 */
LBUI3d.CameraController.prototype.finishZoom = function(isCancel) {
    if (isCancel) {
        this.setZoom(this.startZoomScale);
        return;
    }
};


/**
 * Called to start panning.
 * @protected
 */
LBUI3d.CameraController.prototype.startPan = function() {
    
};

/**
 * Called to actively track a pan.
 * @protected
 * @param {Number} x    The tracked x coordinate.
 * @param {Number} y    The tracked y coordinate.
 * @param {Number} timeStamp    The track event time stamp.
 */
LBUI3d.CameraController.prototype.trackPan = function(x, y, timeStamp) {
    
};

/**
 * Called to finish pan tracking.
 * @protected
 * @param {Boolean} isCancel    If true the pan should be cancelled.
 */
LBUI3d.CameraController.prototype.finishPan = function(isCancel) {
    
};

/**
 * Called to start rotating.
 * @protected
 */
LBUI3d.CameraController.prototype.startRotate = function() {
    
};

/**
 * Called to actively track a rotation.
 * @protected
 * @param {Number} x    The tracked x coordinate.
 * @param {Number} y    The tracked y coordinate.
 * @param {Number} timeStamp    The track event time stamp.
 */
LBUI3d.CameraController.prototype.trackRotate = function(x, y, timeStamp) {
    
};

/**
 * Called to finish rotation tracking.
 * @protected
 * @param {Boolean} isCancel    If true the pan should be cancelled.
 */
LBUI3d.CameraController.prototype.finishRotate = function(isCancel) {
    
};


/**
 * Helper used to adjust a rotation matrix to align the camera axis with the presumed
 * local x-axis (the camera view is along its y axis, so we need to rotate the y axis).
 * @protected
 * @param {LBGeometry.Matrix4} mat  The rotation matrix to be adjusted.
 */
LBUI3d.CameraController.adjustMatForCameraAxis = function(mat) {
    // The camera view is along its y axis, so we need to rotate the y axis by 90 degrees about
    // the local z axis to align the camera's y axis with  the spherical orientation's x axis. 
    // We can do that by hand, since the rotation matrix is simple:
    //  0   1   0
    // -1   0   0
    //  0   0   1
    var old11 = mat.elements[0];
    var old21 = mat.elements[1];
    var old31 = mat.elements[2];
    mat.elements[0] = -mat.elements[4];
    mat.elements[1] = -mat.elements[5];
    mat.elements[2] = -mat.elements[6];
    mat.elements[4] = old11;
    mat.elements[5] = old21;
    mat.elements[6] = old31;
};

/**
 * Calculates the presumed distance to the screen based.
 * This currently only supports {@link LBCamera.PerspectiveCamera}s.
 * @returns {Number}    The distance, 0 if not supported.
 */
LBUI3d.CameraController.prototype.calcScreenDistance = function() {
    if (this.camera.isPerspectiveCamera) {
        if (this.view.container) {
            return this.view.container.clientHeight / (2 * Math.tan(this.camera.fov * LBMath.DEG_TO_RAD * 0.5));
        }
    }
    return 0;
};


/**
 * Converts a camera position and spherical orientation in target local coordinates to
 * a world position and quaternion.
 * @param {LBGeometry.Vector3} localPos The local position.
 * @param {LBSpherical.Orientation} localOrientation    The local spherical orientation.
 * @param {LBGeometry.Vector3} worldPos Set to the world position.
 * @param {LBGeometry.Quaternion} worldQuaternion   Set to the quaternion representing the orientation in world coordinates.
 * @returns {undefined}
 */
LBUI3d.CameraController.prototype.localPosOrientationToWorldPosQuaternion = function(localPos, localOrientation, worldPos, worldQuaternion) {
    this.localLimits.applyLimits(localPos, localOrientation, _workingPosition, _workingOrientation);
    
    var mat = _workingOrientation.toMatrix4(_workingMatrix4);
    LBUI3d.CameraController.adjustMatForCameraAxis(mat);
    mat.setPosition(_workingPosition);

    if (this.target) {
        this.target.updateMatrixWorld();
        mat.premultiply(this.target.matrixWorld);
    }
    
    mat.decompose(worldPos, worldQuaternion, _workingVector3);
};


/**
 * This is normally called from the {@link LBUI3d.View3d#render} method to handle tracking
 * and updating the camera position.
 * @param {Number}  dt  The time step in milliseconds.
 * @param {Boolean} updateCamera    If true the camera should be updated, otherwise it 
 * is just background tracking.
 * @returns {undefined}
 */
LBUI3d.CameraController.prototype.update = function(dt, updateCamera) {
    this.updateCameraPosition(dt, this.currentPosition, this.currentQuaternion);

    if (updateCamera) {
        var coordMapping = (this.view && this.view.scene3D) ? this.view.scene3D.coordMapping : LBUI3d.DirectCoordMapping;
        coordMapping.vector3ToThreeJS(this.currentPosition, this.camera.position);
        coordMapping.quaternionToThreeJS(this.currentQuaternion, this.camera.quaternion);
    }
};


/**
 * Called by {@link LBUI3d.CameraController#update} to update the current camera position
 * @protected
 * @param {Number}  dt  The time step in milliseconds.
 * @param {LBGeometry.Vector3} position The camera world coordinates position to be updated.
 * @param {LBGeometry.Quaternion} quaternion    The camera world coordinates quaternion to be update.
 * @returns {undefined}
 */
LBUI3d.CameraController.prototype.updateCameraPosition = function(dt, position, quaternion) {
    
};



/**
 * A camera controller that sets itself to a local position and orientation
 * on a target. Basically a first person point of view.
 * @constructor
 * @param {LBUI3d.CameraLimits} [localLimits]   Optional limits on the local camera position.
 * @returns {LBUI3d.LocalPOVCameraController}
 */
LBUI3d.LocalPOVCameraController = function(localLimits) {
    LBUI3d.CameraController.call(this, null, localLimits);
    
    /**
     * The current local camera position.
     * @member {LBGeometry.Vector3}
     */
    this.localPosition = new LBGeometry.Vector3();
    
    /**
     * The current camera spherical orientation.
     * @member {LBSpherical.Orientation}
     */
    this.localOrientation = new LBSpherical.Orientation();
    
    /**
     * This is used to determine the azimuth of the forward direction for the standard views.
     * @member {Number}
     */
    this.forwardAzimuthDeg = 0;
    
    /**
     * The deceleration value to use for position, when decelerating after a mouse up
     * with position velocity. In position units/second^2.
     * @member {Number}
     */
    this.positionDecel = 1;
    
    /**
     * The deceleration value to use for orientation degrees, when decelerating after a mouse up
     * with orientation velocity. In degrees/second^2.
     * @member {Number}
     */
    this.degDecel = 1800;
    
    /**
     * The maximum number of seconds to allow for decelerating after a mouse up with position
     * or orientation velocity.
     * @member {Number}
     */
    this.maxTransitionTime = 5;
    
    /**
     * The current transition time in seconds when decelerating after a mouse up with position or orientation
     * velocity. 0 if not decelerating.
     */
    this.currentTransitionTime = 0;
};

LBUI3d.LocalPOVCameraController.prototype = Object.create(LBUI3d.CameraController.prototype);
LBUI3d.LocalPOVCameraController.prototype.constructor = LBUI3d.LocalPOVCameraController;

/**
 * Updates a velocity value for decelerating to zero velocity.
 * @param {Number} dt   The time step.
 * @param {Number} vel  The velocity to decelerate towards zero.
 * @param {Number} decel    The deceleration rate, must be &geq; 0.
 * @returns {Number}    The updated velocity.
 */
function decelVelTowardsZero(dt, vel, decel) {
    if (vel > 0) {
        vel -= dt * decel;
        return Math.max(vel, 0);
    }
    else if (vel < 0) {
        vel += dt * decel;
        return Math.min(vel, 0);
    }
    return vel;
};

/**
 * Calculates the time to decelerate a velocity to zero given the deceleration rate.
 * @param {Number} vel  The velocity.
 * @param {Number} decel    The deceleration, the sign is ignored.
 * @returns {Number}    The time required to decelerate vel to 0.
 */
function calcDecelTimeToZero(vel, decel) {
    // dV / dT = a
    return Math.abs(vel / decel);
};

/**
 * Calculates the deceleration rate for decelerating a velocity to zero over a given time.
 * @param {Number} vel  The velocity.
 * @param {Number} time The time.
 * @returns {Number}    The absolute value of the deceleration.
 */
function calcDecelRateForTime(vel, time) {
    // dV / dT = a
    return Math.abs(vel / time);
};

LBUI3d.LocalPOVCameraController.prototype.updateCameraPosition = function(dt, position, quaternion) {
    if (this.target) {
        if (this.currentTransitionTime > 0) {
            dt = Math.min(dt, this.currentTransitionTime);
            this.currentTransitionTime -= dt;
            
            this.localPosition.x += this.localPositionVel.x * dt;
            this.localPosition.y += this.localPositionVel.y * dt;
            this.localPositionVel.x = decelVelTowardsZero(dt, this.localPositionVel.x, this.localPositionDecel.x);
            this.localPositionVel.y = decelVelTowardsZero(dt, this.localPositionVel.y, this.localPositionDecel.y);
            
            // Probably want to convert this to quaternion based...
            this.localOrientation.altitudeDeg += this.localOrientationVel.altitudeDeg * dt;
            this.localOrientation.azimuthDeg += this.localOrientationVel.azimuthDeg * dt;
            
            this.localOrientationVel.altitudeDeg = decelVelTowardsZero(dt, this.localOrientationVel.altitudeDeg, 
                this.localOrientationDecel.altitudeDeg);
            this.localOrientationVel.azimuthDeg = decelVelTowardsZero(dt, this.localOrientationVel.azimuthDeg, 
                this.localOrientationDecel.azimuthDeg);
        }
        
        this.localPosOrientationToWorldPosQuaternion(this.localPosition, this.localOrientation, position, quaternion);
    }
};

/**
 * Sets the point of view of the camera to a specific position and spherical orientation.
 * @param {LBGeometry.Vector3} position The local position.
 * @param {LBSpherical.Orientation} sphericalOrientation    The spherical orientation.
 * @returns {undefined}
 */
LBUI3d.LocalPOVCameraController.prototype.setLocalCameraPOV = function(position, sphericalOrientation) {
    this.localPosition.copy(position);
    this.localOrientation.copy(sphericalOrientation);
};

/**
 * Requests the point of view of the camera be decelerated to 0 velocity given an initial velocity.
 * @param {LBGeometry.Vector3} positionVel The local position velocity.
 * @param {LBSpherical.Orientation} orientationVel    The spherical orientation velocity.
 * @returns {undefined}
 */
LBUI3d.LocalPOVCameraController.prototype.requestLocalCameraPOVDeceleration = function(positionVel, orientationVel) {
    // Figure out the longest time to decel to zero.
    // Then figure out the deceleration rates to take that time to zero.
    var dt = calcDecelTimeToZero(positionVel.x, this.positionDecel);
    dt = Math.max(dt, calcDecelTimeToZero(positionVel.y, this.positionDecel));
    dt = Math.max(dt, calcDecelTimeToZero(orientationVel.azimuthDeg, this.degDecel));
    dt = Math.max(dt, calcDecelTimeToZero(orientationVel.altitudeDeg, this.degDecel));
    dt = Math.min(dt, this.maxTransitionTime);
    
    if (LBMath.isLikeZero(dt)) {
        this.currentTransitionTime = 0;
        return;
    }
    
    this.currentTransitionTime = dt;
    this.localPositionVel = LBUtil.copyOrClone(this.localPositionVel, positionVel);
    this.localOrientationVel = LBUtil.copyOrClone(this.localOrientationVel, orientationVel);
    
    this.localPositionDecel = this.localPositionDecel || new LBGeometry.Vector3();
    this.localPositionDecel.x = calcDecelRateForTime(positionVel.x, dt);
    this.localPositionDecel.y = calcDecelRateForTime(positionVel.y, dt);
    
    this.localOrientationDecel = this.localOrientationDecel || new LBSpherical.Orientation();
    this.localOrientationDecel.azimuthDeg = calcDecelRateForTime(orientationVel.azimuthDeg, dt);
    this.localOrientationDecel.altitudeDeg = calcDecelRateForTime(orientationVel.altitudeDeg, dt);
};


LBUI3d.LocalPOVCameraController.prototype.setStandardView = function(view) {
    var azimuthDeg = 0;
    this.localOrientation.altitudeDeg = 0;
    
    switch (view) {
        case LBUI3d.CameraController.VIEW_FWD :
            azimuthDeg = 0;
            break;
        case LBUI3d.CameraController.VIEW_FWD_STBD :
            azimuthDeg = -45;
            break;
        case LBUI3d.CameraController.VIEW_STBD :
            azimuthDeg = -90;
            break;
        case LBUI3d.CameraController.VIEW_AFT_STBD :
            azimuthDeg = -135;
            break;
        case LBUI3d.CameraController.VIEW_AFT :
            azimuthDeg = 180;
            break;
        case LBUI3d.CameraController.VIEW_AFT_PORT :
            azimuthDeg = 135;
            break;
        case LBUI3d.CameraController.VIEW_PORT :
            azimuthDeg = 90;
            break;
        case LBUI3d.CameraController.VIEW_FWD_PORT :
            azimuthDeg = 45;
            break;
        case LBUI3d.CameraController.VIEW_UP :
            azimuthDeg = this.localOrientation.azimuthDeg - this.forwardAzimuthDeg;
            this.localOrientation.altitudeDeg = -90;
            break;
            
        default :
            return;
    }
    
    this.localOrientation.azimuthDeg = azimuthDeg + this.forwardAzimuthDeg;
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};

LBUI3d.LocalPOVCameraController.prototype.rotatePOVDeg = function(horzDeg, vertDeg) {
    this.localOrientation.azimuthDeg += horzDeg;
    this.localOrientation.altitudeDeg += vertDeg;
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};


LBUI3d.LocalPOVCameraController.prototype.panPOV = function(dx, dy) {
    this.localPosition.x += dx;
    this.localPosition.y += dy;
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};


LBUI3d.LocalPOVCameraController.prototype.startPan = function() {
    this.originalLocalPosition = LBUtil.copyOrClone(this.originalLocalPosition, this.localPosition);
    this.originalLocalOrientation = LBUtil.copyOrClone(this.originalLocalOrientation, 
        this.localOrientation);
        
    this.screenDistance = this.calcScreenDistance();
};


LBUI3d.LocalPOVCameraController.prototype.trackPan = function(x, y, timeStamp) {
};


LBUI3d.LocalPOVCameraController.prototype.finishPan = function(isCancel) {
    if (isCancel) {
        this.localPosition.copy(this.originalLocalPosition);
        this.localOrientation.copy(this.originalLocalOrientation);
        this.setLocalCameraPOV(this.localPosition, this.localOrientation);
        return;
    }
};


/**
 * Calculates the spherical orientation from the camera POV to a point on the screen.
 * Presumes {@link LBUI3d.LocalPOVCameraController#screenDistance} has been set to a valid distance.
 * @param {Number} x    The x coordinate of the point on the screen in the view container's client coordinates.
 * @param {Number} y    The y coordinate of the point on the screen in the view container's client coordinates.
 * @param {LBSpherical.Orientation} [store] If defined the object to store the orientation into.
 * @returns {LBSpherical.Orientation}   The spherical orientation
 */
LBUI3d.LocalPOVCameraController.prototype.calcOrientationFromScreenPos = function(x, y, store) {
    store = store || new LBSpherical.Orientation();
    
    var dx = x - this.view.container.clientWidth / 2;
    var dy = y - this.view.container.clientHeight / 2;
    
    store.azimuthDeg = Math.atan2(dx, this.screenDistance) * LBMath.RAD_TO_DEG;
    store.altitudeDeg = -Math.atan2(dy, this.screenDistance) * LBMath.RAD_TO_DEG;

    return store;
};


LBUI3d.LocalPOVCameraController.prototype.startRotate = function() {
    this.currentTransitionTime = 0;
    
    this.originalLocalPosition = LBUtil.copyOrClone(this.originalLocalPosition, this.localPosition);
    this.originalLocalOrientation = LBUtil.copyOrClone(this.originalLocalOrientation, 
        this.localOrientation);
        

    this.screenDistance = this.calcScreenDistance();
    if (this.screenDistance) {
        this.startOrientation = this.calcOrientationFromScreenPos(this.startX, this.startY, this.startOrientation);
    }
};


LBUI3d.LocalPOVCameraController.prototype.trackRotate = function(x, y, timeStamp) {
    if (!this.screenDistance) {
        return;
    }
    
    this.prevLocalOrientation = LBUtil.copyOrClone(this.prevLocalOrientation, 
        this.localOrientation);

    this.workingOrientation = this.calcOrientationFromScreenPos(x, y, this.workingOrientation);
    
    this.workingOrientation.azimuthDeg += this.originalLocalOrientation.azimuthDeg - this.startOrientation.azimuthDeg;
    this.workingOrientation.altitudeDeg += this.originalLocalOrientation.altitudeDeg - this.startOrientation.altitudeDeg;
    
    this.localOrientation.copy(this.workingOrientation);
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};


LBUI3d.LocalPOVCameraController.prototype.finishRotate = function(isCancel) {
    if (isCancel) {
        this.localOrientation.copy(this.originalLocalOrientation);
        this.setLocalCameraPOV(this.localPosition, this.localOrientation);
        return;
    }
    
    if ((this.deltaT > 0) && (this.degDecel > 0)) {
        this.localOrientationVel = this.localOrientationVel || new LBSpherical.Orientation();
        
        // If we have an orientation change, then we have a velocity that we can 
        // decelerate to 0.
        this.localOrientationVel.azimuthDeg = (this.localOrientation.azimuthDeg - this.prevLocalOrientation.azimuthDeg) / this.deltaT;
        this.localOrientationVel.altitudeDeg = (this.localOrientation.altitudeDeg - this.prevLocalOrientation.altitudeDeg) / this.deltaT;
        
        this.requestLocalCameraPOVDeceleration(LBGeometry.ZERO, this.localOrientationVel);
    }
};


/**
 * A camera controller that tries to follow the target at a given position relative to the
 * target. This differs from {@link LBUI3d.LocalPOVCameraController} in that for this
 * the camera is looking towards the target, whereas for the first person controller the
 * camera is looking from the target.
 * @constructor
 * @param {LBUI3d.CameraLimits} [globalLimits]   Optional limits on the global camera position.
 * @returns {LBUI3d.LocalPOVCameraController}
 */
LBUI3d.FollowCameraController = function(globalLimits) {
    LBUI3d.CameraController.call(this, globalLimits);
    
    // The camera is ideally positioned at a certain spherical coordinates from the target
    // in the target's local coordinate system.
    // The camera reference orientation is pointing at the target with z the up direction.
    // Rotating the camera involves changing the orientation of the camera relative to its local orientation reference.
    // Panning/zooming the camera has the effect of changing the spherical coordinates
    // of the camera relative to the target.
    //
    // Since the target may be moving all over the place, and we're not on the target,
    // we want to smoothly move in world coordinates. This means that we need to establish
    // a desired world position/orientation, and try to smoothly move towards it, which
    // would be changing every tick.
    
    /**
     * The desired position of the camera relative to the target's local coordinate system, in
     * spherical coordinates.
     * @member {LBSpherical.CoordinatesRAA}
     */
    this.desiredCameraFromTargetLocal = new LBSpherical.CoordinatesRAA();
    
    /**
     * The desired orientation of the camera relative to a reference frame that has
     * the camera pointing at the target and the z axis up.
     * @member {LBSpherical.Orientation}
     */
    this.desiredCameraOrientation = new LBSpherical.Orientation();
    
    // Each tick we want to:
    // Calculate a desired world position/quaternion from the 
    
    this.currentTransitionTime = 0;
};

LBUI3d.FollowCameraController.prototype = Object.create(LBUI3d.CameraController.prototype);
LBUI3d.FollowCameraController.prototype.constructor = LBUI3d.FollowCameraController;

LBUI3d.FollowCameraController.prototype.updateCameraPosition = function(dt, position, quaternion) {
    if (this.target) {
        if (this.currentTransitionTime > 0) {
            dt = Math.min(dt, this.currentTransitionTime);
            this.currentTransitionTime -= dt;
/*            
            this.localPosition.x += this.localPositionVel.x * dt;
            this.localPosition.y += this.localPositionVel.y * dt;
            this.localPositionVel.x = decelVelTowardsZero(dt, this.localPositionVel.x, this.localPositionDecel.x);
            this.localPositionVel.y = decelVelTowardsZero(dt, this.localPositionVel.y, this.localPositionDecel.y);
            
            // Probably want to convert this to quaternion based...
            this.localOrientation.altitudeDeg += this.localOrientationVel.altitudeDeg * dt;
            this.localOrientation.azimuthDeg += this.localOrientationVel.azimuthDeg * dt;
            
            this.localOrientationVel.altitudeDeg = decelVelTowardsZero(dt, this.localOrientationVel.altitudeDeg, 
                this.localOrientationDecel.altitudeDeg);
            this.localOrientationVel.azimuthDeg = decelVelTowardsZero(dt, this.localOrientationVel.azimuthDeg, 
                this.localOrientationDecel.azimuthDeg);
*/            
        }
        
//        this.localPosOrientationToWorldPosQuaternion(this.localPosition, this.localOrientation, position, quaternion);
    }
};

/**
 * Sets the point of view of the camera to a specific position and spherical orientation.
 * @param {LBGeometry.Vector3} position The local position.
 * @param {LBSpherical.Orientation} sphericalOrientation    The spherical orientation.
 * @returns {undefined}
 */
LBUI3d.FollowCameraController.prototype.setLocalCameraPOV = function(position, sphericalOrientation) {
    this.localPosition.copy(position);
    this.localOrientation.copy(sphericalOrientation);
};

/**
 * Requests the point of view of the camera be decelerated to 0 velocity given an initial velocity.
 * @param {LBGeometry.Vector3} positionVel The local position velocity.
 * @param {LBSpherical.Orientation} orientationVel    The spherical orientation velocity.
 * @returns {undefined}
 */
LBUI3d.FollowCameraController.prototype.requestLocalCameraPOVDeceleration = function(positionVel, orientationVel) {
    // Figure out the longest time to decel to zero.
    // Then figure out the deceleration rates to take that time to zero.
    var dt = calcDecelTimeToZero(positionVel.x, this.positionDecel);
    dt = Math.max(dt, calcDecelTimeToZero(positionVel.y, this.positionDecel));
    dt = Math.max(dt, calcDecelTimeToZero(orientationVel.azimuthDeg, this.degDecel));
    dt = Math.max(dt, calcDecelTimeToZero(orientationVel.altitudeDeg, this.degDecel));
    dt = Math.min(dt, this.maxTransitionTime);
    
    if (LBMath.isLikeZero(dt)) {
        this.currentTransitionTime = 0;
        return;
    }
    
    this.currentTransitionTime = dt;
    this.localPositionVel = LBUtil.copyOrClone(this.localPositionVel, positionVel);
    this.localOrientationVel = LBUtil.copyOrClone(this.localOrientationVel, orientationVel);
    
    this.localPositionDecel = this.localPositionDecel || new LBGeometry.Vector3();
    this.localPositionDecel.x = calcDecelRateForTime(positionVel.x, dt);
    this.localPositionDecel.y = calcDecelRateForTime(positionVel.y, dt);
    
    this.localOrientationDecel = this.localOrientationDecel || new LBSpherical.Orientation();
    this.localOrientationDecel.azimuthDeg = calcDecelRateForTime(orientationVel.azimuthDeg, dt);
    this.localOrientationDecel.altitudeDeg = calcDecelRateForTime(orientationVel.altitudeDeg, dt);
};


LBUI3d.FollowCameraController.prototype.setStandardView = function(view) {
    var azimuthDeg = 0;
    this.localOrientation.altitudeDeg = 0;
    
    switch (view) {
        case LBUI3d.CameraController.VIEW_FWD :
            azimuthDeg = 0;
            break;
        case LBUI3d.CameraController.VIEW_FWD_STBD :
            azimuthDeg = -45;
            break;
        case LBUI3d.CameraController.VIEW_STBD :
            azimuthDeg = -90;
            break;
        case LBUI3d.CameraController.VIEW_AFT_STBD :
            azimuthDeg = -135;
            break;
        case LBUI3d.CameraController.VIEW_AFT :
            azimuthDeg = 180;
            break;
        case LBUI3d.CameraController.VIEW_AFT_PORT :
            azimuthDeg = 135;
            break;
        case LBUI3d.CameraController.VIEW_PORT :
            azimuthDeg = 90;
            break;
        case LBUI3d.CameraController.VIEW_FWD_PORT :
            azimuthDeg = 45;
            break;
        case LBUI3d.CameraController.VIEW_UP :
            azimuthDeg = this.localOrientation.azimuthDeg - this.forwardAzimuthDeg;
            this.localOrientation.altitudeDeg = -90;
            break;
            
        default :
            return;
    }
    
    this.localOrientation.azimuthDeg = azimuthDeg + this.forwardAzimuthDeg;
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};

LBUI3d.FollowCameraController.prototype.rotatePOVDeg = function(horzDeg, vertDeg) {
    this.localOrientation.azimuthDeg += horzDeg;
    this.localOrientation.altitudeDeg += vertDeg;
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};


LBUI3d.FollowCameraController.prototype.panPOV = function(dx, dy) {
    this.localPosition.x += dx;
    this.localPosition.y += dy;
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};


LBUI3d.FollowCameraController.prototype.startPan = function() {
    this.originalLocalPosition = LBUtil.copyOrClone(this.originalLocalPosition, this.localPosition);
    this.originalLocalOrientation = LBUtil.copyOrClone(this.originalLocalOrientation, 
        this.localOrientation);
        
    this.screenDistance = this.calcScreenDistance();
};


LBUI3d.FollowCameraController.prototype.trackPan = function(x, y, timeStamp) {
};


LBUI3d.FollowCameraController.prototype.finishPan = function(isCancel) {
    if (isCancel) {
        this.localPosition.copy(this.originalLocalPosition);
        this.localOrientation.copy(this.originalLocalOrientation);
        this.setLocalCameraPOV(this.localPosition, this.localOrientation);
        return;
    }
};


/**
 * Calculates the spherical orientation from the camera POV to a point on the screen.
 * Presumes {@link LBUI3d.LocalPOVCameraController#screenDistance} has been set to a valid distance.
 * @param {Number} x    The x coordinate of the point on the screen in the view container's client coordinates.
 * @param {Number} y    The y coordinate of the point on the screen in the view container's client coordinates.
 * @param {LBSpherical.Orientation} [store] If defined the object to store the orientation into.
 * @returns {LBSpherical.Orientation}   The spherical orientation
 */
LBUI3d.FollowCameraController.prototype.calcOrientationFromScreenPos = function(x, y, store) {
    store = store || new LBSpherical.Orientation();
    
    var dx = x - this.view.container.clientWidth / 2;
    var dy = y - this.view.container.clientHeight / 2;
    
    store.azimuthDeg = Math.atan2(dx, this.screenDistance) * LBMath.RAD_TO_DEG;
    store.altitudeDeg = -Math.atan2(dy, this.screenDistance) * LBMath.RAD_TO_DEG;

    return store;
};


LBUI3d.FollowCameraController.prototype.startRotate = function() {
    this.currentTransitionTime = 0;
    
    this.originalLocalPosition = LBUtil.copyOrClone(this.originalLocalPosition, this.localPosition);
    this.originalLocalOrientation = LBUtil.copyOrClone(this.originalLocalOrientation, 
        this.localOrientation);
        

    this.screenDistance = this.calcScreenDistance();
    if (this.screenDistance) {
        this.startOrientation = this.calcOrientationFromScreenPos(this.startX, this.startY, this.startOrientation);
    }
};


LBUI3d.FollowCameraController.prototype.trackRotate = function(x, y, timeStamp) {
    if (!this.screenDistance) {
        return;
    }
    
    this.prevLocalOrientation = LBUtil.copyOrClone(this.prevLocalOrientation, 
        this.localOrientation);

    this.workingOrientation = this.calcOrientationFromScreenPos(x, y, this.workingOrientation);
    
    this.workingOrientation.azimuthDeg += this.originalLocalOrientation.azimuthDeg - this.startOrientation.azimuthDeg;
    this.workingOrientation.altitudeDeg += this.originalLocalOrientation.altitudeDeg - this.startOrientation.altitudeDeg;
    
    this.localOrientation.copy(this.workingOrientation);
    this.setLocalCameraPOV(this.localPosition, this.localOrientation);
};


LBUI3d.FollowCameraController.prototype.finishRotate = function(isCancel) {
    if (isCancel) {
        this.localOrientation.copy(this.originalLocalOrientation);
        this.setLocalCameraPOV(this.localPosition, this.localOrientation);
        return;
    }
    
    if ((this.deltaT > 0) && (this.degDecel > 0)) {
        this.localOrientationVel = this.localOrientationVel || new LBSpherical.Orientation();
        
        // If we have an orientation change, then we have a velocity that we can 
        // decelerate to 0.
        this.localOrientationVel.azimuthDeg = (this.localOrientation.azimuthDeg - this.prevLocalOrientation.azimuthDeg) / this.deltaT;
        this.localOrientationVel.altitudeDeg = (this.localOrientation.altitudeDeg - this.prevLocalOrientation.altitudeDeg) / this.deltaT;
        
        this.requestLocalCameraPOVDeceleration(LBGeometry.ZERO, this.localOrientationVel);
    }
};

return LBUI3d;
});
