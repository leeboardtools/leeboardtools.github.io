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

    
define(['lbphysics', 'lbgeometry', 'lbsailsimbase', 'lbmath'], 
function(LBPhysics, LBGeometry, LBSailSim, LBMath) {

    'use strict';

    
/**
 * An instance of a propulsor, which is an object that exerts some type of propulsive
 * force.
 * @constructor
 * @extends module:LBPhysics.RigidBody
 * @param {module:LBGeometry.Object3D} obj3D    The object 3D defining the local coordinate system of
 * the propulsor.
 * @param {Number} [maxForce=10] The maximum force magnitude generated by the propulsor.
 * @param {Number} [minForce=0] The minimum force magnitude generated by the propulsor, may be negative.
 * @returns {LBSailSim.Propulsor}
 */
LBSailSim.Propulsor = function(obj3D, maxForce, minForce) {
    LBPhysics.RigidBody.call(this, obj3D, 0);
    this.forceMag = 0;
    this.forceDir = new LBGeometry.Vector3(1, 0, 0);
    this.maxForce = maxForce || 10;
    this.minForce = minForce || 0;
};

LBSailSim.Propulsor._workingForce = new LBGeometry.Vector3();
LBSailSim.Propulsor._workingPos = new LBGeometry.Vector3();
LBSailSim.Propulsor.prototype = Object.create(LBPhysics.RigidBody.prototype);
LBSailSim.Propulsor.prototype.constructor = LBSailSim.Propulsor;

LBSailSim.Propulsor.prototype.destroy = function() {
    if (this.forceDir) {
        this.forceDir = null;
        LBPhysics.RigidBody.prototype.destroy.call(this);
    }
};

/**
 * Updates the force generated by the propulsor.
 * @param {Number} dt   The simulation time step.
 * @returns {LBSailSim.Propulsor}    this.
 */
LBSailSim.Propulsor.prototype.updateForce = function(dt) {
    var forceMag = LBMath.clamp(this.forceMag, this.minForce, this.maxForce);
    if (forceMag === 0) {
        return this;
    }
    
    var force = LBSailSim.Propulsor._workingForce;
    force.copy(this.forceDir);
    force.multiplyScalar(forceMag);
    force.applyMatrix4Rotation(this.coordSystem.worldXfrm);
    
    var pos = LBSailSim.Propulsor._workingPos;
    pos.zero();
    pos.applyMatrix4(this.coordSystem.worldXfrm);
    
    this.addWorldForce(force, pos);
            
    return this;
};

/**
 * Loads the propulsor from the properties of a data object.
 * @param {object} data The data to load from.
 * @returns {LBSailSim.Propulsor}   this.
 */
LBSailSim.Propulsor.prototype.load = function(data) {
    LBPhysics.RigidBody.prototype.load.call(this, data);
    
    this.name = data.name || "";
    this.forceMag = data.forceMag || this.forceMag;
    this.minForce = data.minForce || this.minForce;
    this.maxForce = data.maxForce || this.maxForce;
    if (data.forceDir) {
        LBGeometry.loadVector3(data.forceDir, this.forceDir);
    }
    else {
        this.forceDir.set(1, 0, 0);
    }
    return this;
};

return LBSailSim;
});

