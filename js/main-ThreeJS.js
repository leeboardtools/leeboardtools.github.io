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


/* global THREE, LBSailSim, LBUI3d, LBMath, LBUtil */


/*
 * Some colors:
 * F0 Light gray:
 * F1 Subdued green:   rgb(0, 173, 0)      hsl(120, 100%, 34%)
 * F2 Green 2:         rgb(114, 210, 45)   hsl(95, 65%, 50%)
 * F3 Faded green:     rgb(200, 245, 77)   hsl(76, 89%, 63%)
 * F4 OK Bright yellow:rgb(255, 255, 112)  hsl(60, 100%, 72%)
 * Brigh yellow:    rgb(255, 255, 0)    hsl(60, 100%, 50%) (Very bright!)
 * F5 Bright orange:   rgb(255, 123, 0)    hsl(29, 100%, 50%)
 * F6 Red x             rgb(167, 22, 22)    hsl(0, 77%, 37%)
 * F6 Subdued red:     rgb(189, 0, 0)      hsl(0, 100%, 37%)
 * F8 Bright red:      rgb(255, 0, 0)      hsl(0, 100%, 50%)
 */

LBMyApp = function() {
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

    this.rudderSliderElement = document.getElementById('rudder_slider');
    this.throttleSliderElement = document.getElementById('throttle_slider');
    
    this.mainsheetSliderElement = document.getElementById('main_slider');
    this.jibsheetSliderElement = document.getElementById('jib_slider');
    
    this.windDeg = 0;
    this.windForce = 2;

};

LBMyApp.prototype = Object.create(LBUI3d.App3D.prototype);
LBMyApp.prototype.constructor = LBMyApp;

LBMyApp.prototype.addNormalView = function(view) {
    view.installOrbitControls(3, 10000, Math.PI * 0.5);
    this.addView(view);
};

LBMyApp.prototype.init = function(mainContainer) {
    LBUI3d.App3D.prototype.init.call(this, mainContainer);

    if (this.throttleSliderElement) {
        this.throttleSliderElement.hidden = true;
    }
    
// TEST!!!
    var scene = this.mainScene.scene;
    
    var geometry = new THREE.BoxGeometry(1, 1, 1);
    var material = new THREE.MeshPhongMaterial({color: 0x008800 });
    var cube = new THREE.Mesh(geometry, material);
    cube.rotation.x = 0.3;
    cube.rotation.y = 0.4;
    scene.add(cube);
// TEST!!!

    this.setWindForce(2);
};

LBMyApp.prototype.update = function() {
    LBUI3d.App3D.prototype.update.call(this);
};

LBMyApp.prototype.fpsUpdated = function() {
    if (this.fpsElement) {
        this.fpsElement.textContent = LBMath.round(this.fps);
    }
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
    
    this.windForce = force;
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

LBMyApp.prototype.windIncrease = function() {
    this.setWindForce(this.windForce + 1);
};

LBMyApp.prototype.windDecrease = function() {
    this.setWindForce(this.windForce - 1);
};

LBMyApp.prototype.setWindDirDeg = function(dirDeg) {
    this.windDeg = LBMath.wrapDegrees(dirDeg);
    
    // TEST!!!
    this.updateAppWind(this.windDeg, this.windForce);
};

LBMyApp.prototype.updateAppWind = function(dirDeg, speed) {
    if (this.appWindDirElement) {
        this.appWindDirElement.style.transform = "rotate(" + dirDeg + "deg)";
    }
   
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
        element.clientWidth = element.clientHeight;
    }
    else if (element.clientWidth < element.clientHeight) {
        element.clientHeight = element.clientWidth;
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

LBMyApp.prototype.onRudderChange = function(value) {
};

LBMyApp.prototype.onThrottleChange = function(value) {
};

LBMyApp.prototype.onJibsheetChange = function(value) {
    
};

LBMyApp.prototype.onMainsheetChange = function(value) {
   
};


var myApp = new LBMyApp();
myApp.start(document.getElementById('main_view'));
