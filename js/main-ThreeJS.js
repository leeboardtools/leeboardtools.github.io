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


require( ['three', 'lbsailsim', 'lbui3d', 'lbutil', 'lbmath', 'lbgeometry', 'lbassets', 'lbsailsimthree'],
    function(THREE, LBSailSim, LBUI3d, LBUtil, LBMath, LBGeometry, LBAssets) {
        
function LBMyApp() {
    LBUI3d.App3D.call(this);
    
    var mainViewContainer = document.getElementById('main_view');
    this.mainView = new LBUI3d.View3D(this.mainScene, mainViewContainer);
    this.addNormalView(this.mainView);
    
    this.pipLowerLeftView = undefined;
    this.pipLowerRightView = undefined;
    
    this.pipMapView = undefined;
    
    this.fpsElement = document.getElementById('hud_fps');
    this.appWindDirElement = document.getElementById('app_wind_dial');
    
    this.isHUDBoatOn = false;
    this.isHUDWindOn = false;
    this.isHUDForceOn = false;
    
    this.hudHeadingElement = document.getElementById('hud_heading');
    this.hudSpeedElement = document.getElementById('hud_speed');
    this.hudVMGElement = document.getElementById('hud_vmg');
    this.hudLeewayDegElement = document.getElementById('hud_leeway_deg');
    this.hudLeewayDirElement = document.getElementById('hud_leeway_dir');
    
    this.hudWindDirElement = document.getElementById('hud_wind_dir');
    this.hudWindSpeedElement = document.getElementById('hud_wind_speed');
    

    this.rudderSliderElement = document.getElementById('rudder_slider');
    this.rudderControl = document.getElementById('rudder');
    this.throttleSliderElement = document.getElementById('throttle_slider');
    this.throttleControl = document.getElementById('throttle');
    
    this.mainsheetSliderElement = document.getElementById('main_slider');
    this.mainsheetControl = document.getElementById('mainsheet');
    this.jibsheetSliderElement = document.getElementById('jib_slider');
    this.jibsheetControl = document.getElementById('jibsheet');
    
    this.assetLoader = new LBAssets.Loader();
    
    this.toggleHUDBoat();
    this.toggleHUDWind();
    
    // TODO Get rid of windDeg, windForce...
    this.windDeg = 0;
    this.windForce = 2;
    
    
    this.physicsEngineType = LBSailSim.SailEnvTHREE.CANNON_PHYSICS;
};

LBMyApp.prototype = Object.create(LBUI3d.App3D.prototype);
LBMyApp.prototype.constructor = LBMyApp;

LBMyApp.prototype.addNormalView = function(view) {
    view.installOrbitControls(3, 10000, Math.PI * 0.5, false);
    this.addView(view);
};

LBMyApp.prototype.init = function(mainContainer) {
    LBUI3d.App3D.prototype.init.call(this, mainContainer);

    var me = this;
    document.addEventListener('keypress', function(event) {
        me.onKeyPressEvent(event);
    }, false);
    document.addEventListener('keydown', function(event) {
        me.onKeyDownEvent(event);
    }, false);
    
    this.initSceneEnv();
    this.initSailEnv();

    this.setWindForce(2);
    
    this.onWindowResize();
};

LBMyApp.prototype.initSceneEnv = function() {
    this.mainView.camera.position.x = 10;
    this.mainView.camera.position.y = 10;
    this.mainView.camera.position.z = 10;
    this.mainView.camera.lookAt(LBGeometry.ORIGIN);
    
    // Water
    var geometry = new THREE.PlaneGeometry(10000, 10000);
    var material = new THREE.MeshBasicMaterial({ color: 0x0086b3, side: THREE.DoubleSide });
    var plane = new THREE.Mesh(geometry, material);
    plane.rotateX(-LBMath.PI_2);
    this.mainScene.scene.add(plane);
    
    // Sky
    geometry = new THREE.SphereGeometry(1000, 25, 25);
    material = new THREE.MeshPhongMaterial({ color: 0xe5ffff, side: THREE.BackSide });
    var dome = new THREE.Mesh(geometry, material);
    this.mainScene.scene.add(dome);
   
    var light = new THREE.HemisphereLight(0xe5ffff, 0x0086b3, 1);
    this.mainScene.scene.add(light);
/*
    var me = this;
    this.mainScene.loadJSONModel('models/tubby_hull.json', function(model) {
        me.myModel = model;
        me.mainScene.scene.add(model);
    });
*/    
    this.mainScene.scene.add(new THREE.AxisHelper(3));
// TEST!!!    
};

LBMyApp.prototype.initSailEnv = function() {
    this.sailEnv = new LBSailSim.SailEnvTHREE(this, this.physicsEngineType, this.assetLoader);
    
    this.loadEnvironment('basin');
};

LBMyApp.prototype.loadEnvironment = function(name) {
    var me = this;
    this.sailEnv.loadEnv(name, function() {
        me.loadEnvCompleted();
    });
};

LBMyApp.prototype.loadEnvCompleted = function() {
    // Load a boat...
    var boatType = Object.keys(this.sailEnv.boatsByType)[0];
    var boatName = Object.keys(this.sailEnv.boatsByType[boatType])[0];
    var centerX = 0;
    var centerY = 0;
    var rotDeg = 0;
    rotDeg = 180;
    centerX = 5;
    this.myBoat = this.sailEnv.checkoutBoat(boatType, boatName, centerX, centerY, rotDeg);
    
    if (this.throttleSliderElement) {
        this.throttleSliderElement.hidden = !this.myBoat.getThrottleController();
    }
    if (this.jibsheetSliderElement) {
        this.jibsheetSliderElement.hidden = !this.myBoat.getJibsheetController();
    }
    if (this.mainsheetSliderElement) {
        this.mainsheetSliderElement.hidden = !this.myBoat.getMainsheetController();
    }
};

LBMyApp.updateControlFromController = function(controller, control) {
    if (!controller || !control) {
        return;
    }
    
    var value = controller.getValue();
    value = LBMath.mapInRange(value, controller.minValue, controller.maxValue, parseFloat(control.min), parseFloat(control.max));
    control.value = value;
};

//------------------------------ --------------------
LBMyApp.moveControllerWithKey = function(controller, key, isDecrease, control) {
    if (!controller) {
        return;
    }

    var range = controller.maxValue - controller.minValue;
    var delta = range / 50;
    if (key.shiftKey) {
        delta *= 0.25;
    }
    else if (key.altKey) {
        delta *= 4.0;
    }
    if (isDecrease) {
        delta = -delta;
    }
    controller.setValue(delta, true);
    
    LBMyApp.updateControlFromController(controller, control);
};

LBMyApp.prototype.onKeyDownEvent = function(event) {
    switch (event.key) {
        case ' ' :
            if (this.myBoat) {
                var controller = this.myBoat.getRudderController();
                if (controller) {
                    controller.setValue(0);
                    LBMyApp.updateControlFromController(controller, this.rudderControl);
                }
            }
            break;
        case 'ArrowLeft' :
            if (this.myBoat) {
                LBMyApp.moveControllerWithKey(this.myBoat.getRudderController(), event, true, this.rudderControl);
            }
            break;
            
        case 'ArrowRight' :
            if (this.myBoat) {
                LBMyApp.moveControllerWithKey(this.myBoat.getRudderController(), event, false, this.rudderControl);
            }
            break;
            
        case 'ArrowUp' :
            if (this.myBoat) {
                LBMyApp.moveControllerWithKey(this.myBoat.getMainsheetController(), event, false, this.mainsheetControl);
            }
            break;
            
        case 'ArrowDown' :
            if (this.myBoat) {
                LBMyApp.moveControllerWithKey(this.myBoat.getMainsheetController(), event, true, this.mainsheetControl);
            }
            break;
    }
};

LBMyApp.prototype.onKeyPressEvent = function(event) {
    switch (event.code) {
        case 'KeyP' :
            this.togglePaused();
            break;
            
        case 'KeyS' :
            this.runSingleStep();
            break;
    }
};

LBMyApp.prototype.update = function() {
    LBUI3d.App3D.prototype.update.call(this);
    
    this.sailEnv.update();
    
    this.updateHUDBoat();
    this.updateHUDWind();
    
    this.updateCameras();
};

LBMyApp.prototype.updateHUDBoat = function() {
    if (this.isHUDBoatOn) {
        if (this.hudHeadingElement) {
            var heading = (this.myBoat) ? this.myBoat.getHeadingDeg(true) : 0;
            this.hudHeadingElement.innerText = heading.toFixed(0);
        }
        
        if (this.hudSpeedElement) {
            var speed = (this.myBoat) ? this.myBoat.getKnots() : 0;
            this.hudSpeedElement.innerText = speed.toFixed(2);
        }
        
        if (this.hudVMGElement) {
            var vmg = 0;
            if (this.myBoat) {
                var trueWind = this.myBoat.getTrueWindVelocityMPS();
                var trueWindSpeed = trueWind.length();
                if (!LBMath.isLikeZero(trueWindSpeed)) {
                    vmg = -this.myBoat.getVelocityMPS().dot(trueWind) / trueWindSpeed;
                    vmg = LBUtil.mps2kt(vmg);
                }
            }
            this.hudVMGElement.innerText = vmg.toFixed(2);
        }
        
        if (this.hudLeewayDegElement || this.hudLeewayDirElement) {
            var leewayAngle = 0;
            var leewayDir = "";
            if (this.myBoat) {
                if (!LBMath.isLikeZero(this.myBoat.getKnots())) {
                    leewayAngle = this.myBoat.getLeewayDeg(true);
                    if (leewayAngle < 0) {
                        leewayDir = "S";
                    }
                    else if (leewayAngle > 0) {
                        leewayDir = "P";
                    }
                }
            }
            
            this.hudLeewayDegElement.innerText = leewayAngle.toFixed();
            this.hudLeewayDirElement.innerHTML = "&deg;" + leewayDir;
        }
    }
};

LBMyApp.prototype.updateHUDWind = function() {
    var windSpeed = 0;
    var windDir = 0;
    if (this.myBoat) {
        windSpeed = this.myBoat.getApparentWindKnots();
        windDir = (LBMath.isLikeZero(this.myBoat.getApparentWindKnots())) ? 0 : this.myBoat.getApparentWindBearingDeg(true);
    }
    else {
        // TODO: Grab the true wind information...
    }
    
    if (this.isHUDWindOn) {
        if (this.hudWindSpeedElement) {
            this.hudWindSpeedElement.innerText = windSpeed.toFixed(2);
        }
        if (this.hudWindDirElement) {
            this.hudWindDirElement.innerText = windDir;
        }
    }
    
    if (this.appWindDirElement) {
        this.appWindDirElement.style.transform = "rotate(" + windDir + "deg)";
    }
    
    var force = LBSailSim.Wind.getForceForKnots(windSpeed);
    var element = document.getElementsByClassName("wind_speed_indicator")[0];
    for (var i = 0; i <= force; ++i) {
        var led = element.getElementsByClassName('wind_speed_led_f' + i)[0];
        var style = window.getComputedStyle(led, null);
        led.style.backgroundColor = setColorFunctionAlpha(style.backgroundColor, ' 1.0');
    }
    
    for (var i = force + 1; i <= 8; ++i) {
        var led = element.getElementsByClassName('wind_speed_led_f' + i)[0];
        var style = window.getComputedStyle(led, null);
        led.style.backgroundColor = setColorFunctionAlpha(style.backgroundColor, ' 0.1');
    }
};

LBMyApp.prototype.updateCameras = function() {
    if (this.mainView.controls && this.mainView.controls.target && this.myBoat) {
        this.mainView.controls.target.copy(this.myBoat.obj3D.getWorldPosition());
        this.mainView.controls.update();
    }
};

LBMyApp.prototype.fpsUpdated = function() {
    if (this.fpsElement) {
        this.fpsElement.textContent = LBMath.round(this.fps);
    }
};

LBMyApp.prototype.onWindowResize = function() {
    LBUI3d.App3D.prototype.onWindowResize.call(this);
    
    // Shrink the controls if necessary.
    var container = document.getElementById('container');
    var maxWidth = container.clientWidth - 100;
    var maxHeight = container.clientHeight - 100;
    
    document.getElementById('right_controls').style.maxWidth = maxHeight + 'px';
    document.getElementById('bottom_controls').style.maxWidth = maxWidth + 'px';
};

function setColorFunctionAlpha(color, alpha) {
    if (color.startsWith('hsla') || color.startsWith('rgba')) {
        var pos = color.lastIndexOf(',');
        color = color.slice(0, pos+1) + alpha + ')';
    }
    else if (color.startsWith('hsl') || color.startsWith('rgb')) {
        var pos = color.lastIndexOf(')');
        color = color.slice(0, 3) + 'a' + color.slice(3, pos) + ',' + alpha + ')';
    }
    return color;
}

LBMyApp.prototype.setWindForce = function(force) {
    if ((force < 0) || (force > 8)) {
        return;
    }
    
    this.sailEnv.wind.setAverageForce(force);
    
    this.windForce = force;
};

LBMyApp.prototype.windIncrease = function() {
    this.setWindForce(this.windForce + 1);
};

LBMyApp.prototype.windDecrease = function() {
    this.setWindForce(this.windForce - 1);
};

LBMyApp.prototype.setWindDirDeg = function(dirDeg) {
    this.sailEnv.wind.setAverageFromDeg(dirDeg);
    
    this.windDeg = LBMath.wrapDegrees(dirDeg);    
};

LBMyApp.prototype.windBack = function() {
    this.setWindDirDeg(this.windDeg - 10);
};

LBMyApp.prototype.windVeer = function() {
    this.setWindDirDeg(this.windDeg + 10);
};


LBMyApp.prototype.toggleForceArrows = function() {
    
};

LBMyApp.prototype.toggleVelocityArrows = function() {
    
};

LBMyApp.prototype.toggleWindArrows = function() {
    
};

function toggleByWidth(element, property, onOffset) {
    onOffset = onOffset || "0px";
    if (element.style[property] === onOffset) {
        element.style[property] = "-" + element.clientWidth + "px";
        return false;
    }

    element.style[property] = onOffset;
    return true;
}

function toggleByHeight(element, property, onOffset) {
    onOffset = onOffset || "0px";
    if (element.style[property] === onOffset) {
        element.style[property] = "-" + element.clientHeight + "px";
        return false;
    }

    element.style[property] = onOffset;
    return true;
}

LBMyApp.prototype.toggleHUDBoat = function() {
    var element = document.getElementById("hud_popup_boat");
    var isOn = toggleByWidth(element, "left");
    this.isHUDBoatOn = isOn;
    
    var label = document.getElementById("hud_label_boat");
    label.style.visibility = (isOn) ? "visible" : "";
};

LBMyApp.prototype.toggleHUDWind = function() {
    var element = document.getElementById("hud_popup_wind");
    var isOn = toggleByWidth(element, "left");
    this.isHUDWindOn = isOn;
    
    var label = document.getElementById("hud_label_wind");
    label.style.visibility = (isOn) ? "visible" : "";
};

LBMyApp.prototype.toggleHUDForce = function() {
    var element = document.getElementById("hud_popup_force");
    var isOn = toggleByWidth(element, "left");
    this.isHUDForceOn = isOn;
    
    var label = document.getElementById("hud_label_force");
    label.style.visibility = (isOn) ? "visible" : "";
};

LBMyApp.prototype.toggleMap = function() {
    var element = document.getElementById("pip_map");
    
    // Want to keep the map square...
    if (element.clientWidth > element.clientHeight) {
        element.style.width = element.clientHeight + 'px';;
    }
    else if (element.clientWidth < element.clientHeight) {
        element.style.height = element.clientWidth + 'px';
    }
    
    var isOn = toggleByWidth(element, "right");
    if (isOn) {
        
    }
    else {
        
    }
};

LBMyApp.prototype.createPIPView = function(pipElement) {
    var view = new LBUI3d.View3D(this.mainScene, pipElement);
    this.addNormalView(view);
    return view;
};

LBMyApp.prototype.togglePIPLowerLeft = function() {
    var element = document.getElementById("pip_lower_left");
    var isOn = toggleByWidth(element, "left");
    
    if (isOn) {
        if (!this.pipLowerLeftView) {
            this.pipLowerLeftView = this.createPIPView(element);
        }
        this.pipLowerLeftView.isEnabled = true;
    }
    else {
        if (this.pipLowerLeftView) {
            this.pipLowerLeftView.isEnabled = false;
        }
    }
    
    // Flip the arrow direction...
    element = document.getElementById("pip_lower_left_btn");
    var elements = element.getElementsByTagName("i");
    elements[0].innerHTML = (isOn) ? "&#xE5CB;" : "&#xE5CC;";
};

LBMyApp.prototype.togglePIPLowerRight = function() {
    var element = document.getElementById("pip_lower_right");
    var isOn = toggleByWidth(element, "right");
    
    if (isOn) {
        if (!this.pipLowerRightView) {
            this.pipLowerRightView = this.createPIPView(element);
        }
        this.pipLowerRightView.isEnabled = true;
    }
    else {
        if (this.pipLowerRightView) {
            this.pipLowerRightView.isEnabled = false;
        }
    }
    
    // Flip the arrow direction...
    element = document.getElementById("pip_lower_right_btn");
    var elements = element.getElementsByTagName("i");
    elements[0].innerHTML = (isOn) ? "&#xE5CC;" : "&#xE5CB;";
};

LBMyApp.prototype.toggleFullScreen = function(container) {
    var isFullScreen = LBUI3d.App3D.prototype.toggleFullScreen.call(this, container);
    var element = document.getElementById('menu_full_screen');
    var elements = element.getElementsByTagName('i');
    elements[0].innerHTML = (isFullScreen) ? "&#xE5D1;" : "&#xE5D0;";
};

LBMyApp.prototype.nextMouseMode = function() {
    var mouseMode = LBUI3d.App3D.prototype.nextMouseMode.call(this);
    
    var cursor;
    var innerHTML;
    switch (mouseMode) {
        case LBUI3d.View3D.MOUSE_PAN_MODE :
            innerHTML = "&#xE89F;";
            cursor = "default";
            break;
            
        case LBUI3d.View3D.MOUSE_ROTATE_MODE :
            innerHTML = "&#xE84D;";
            cursor = "move";
            break;
            
        default :
            return;
    }
    
    var element = document.getElementById('menu_mouse_mode');
    var elements = element.getElementsByTagName('i');
    elements[0].innerHTML = innerHTML;
    
    this.views.forEach(function(view) {
        view.container.style.cursor = cursor;
    });
};

LBMyApp.prototype.onRudderChange = function(value, min, max) {
    if (this.myBoat) {
        var rudderController = this.myBoat.getRudderController();
        if (rudderController) {
            rudderController.setMappedValue(value, max, min);
        }
    }
};

LBMyApp.prototype.onThrottleChange = function(value, min, max) {
    if (this.myBoat) {
        var controller = this.myBoat.getThrottleController();
        if (controller) {
            controller.setMappedValue(value, min, max);
        }
    }
};

LBMyApp.prototype.onJibsheetChange = function(value, min, max) {
    if (this.myBoat) {
        var controller = this.myBoat.getJibsheetController();
        if (controller) {
            controller.setMappedValue(value, min, max);
        }
    }
};

LBMyApp.prototype.onMainsheetChange = function(value, min, max) {
    if (this.myBoat) {
        var controller = this.myBoat.getMainsheetController();
        if (controller) {
            controller.setMappedValue(value, min, max);
        }
    }
};


if ( ! Detector.webgl ) {
    var mainErrorElement = document.getElementById('fatal_error');
    var titleElement = document.getElementById('fatal_error_title');
    var msgElement = document.getElementById('fatal_error_msg');
    var msg2Element = document.getElementById('fatal_error_msg2');
    Detector.addGetWebGLMessage({ parent: msgElement, id: 'webGL_error_msg'});

    var webGLErrorElement = document.getElementById('webGL_error_msg');
    webGLErrorElement.style.fontSize = msgElement.style.fontSize;
    webGLErrorElement.style.width = msgElement.style.width;
    
    titleElement.innerHTML = "Sorry, ByTheLee could not be started. )-:";    
    msg2Element.innerHTML = "If you are running a modern browser, make sure WebGL is enabled.";
    mainErrorElement.style.visibility = "visible";
}
else {
    myApp = new LBMyApp();
    myApp.start(document.getElementById('main_view'));
}

}
);