/* 
 * Copyright 2018 Albert Santos.
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

function setupTLayers(map) {
    'use strict';
    
//
// TODO:
// Orange line likes to give trips with ids that start with 'ADDED' and
// don't have a shape id, especially on weekends.
// Could potentially do a shape search with route and direction, and pick what's returned?
//  
    
var shapes = new Map();
var stops = new Map();
var trips = new Map();
var vehicles = new Map();
var routes = new Map();

var vehiclePredictionsToFetch = new Set();

var dumpShapeInfo = false;
//dumpShapeInfo = true;

const ROUTE_LIGHT_RAIL = 0;
const ROUTE_HEAVY_RAIL = 1;
const ROUTE_COMMUTER_RAIL = 2;
const ROUTE_BUS = 3;
const ROUTE_FERRY = 4;

var tLayers = {
    shapes: shapes,
    stops: stops,
    trips: trips,
    vehicles: vehicles,
    routes: routes,
    ROUTE_LIGHT_RAIL: ROUTE_LIGHT_RAIL,
    ROUTE_HEAVY_RAIL: ROUTE_HEAVY_RAIL,
    ROUTE_COMMUTER_RAIL: ROUTE_COMMUTER_RAIL,
    ROUTE_BUS: ROUTE_BUS,
    ROUTE_FERRY: ROUTE_FERRY,

    isStopsDisplayed: true,
    isShapesDisplayed: true,
    isVehiclesDisplayed: true,
    
    isEstimateVehicleLocations: false,
    isSaveSettings: true,
    maxTimeStampFadeMilliSeconds: 2 * 60 * 1000,
    vehiclePositionTimeToleranceMilliSeconds: 10000,
    
    currentUpdateDate: Date.now()

};


function getSettingsAsJSON() {
    return {
        isEstimateVehicleLocations: tLayers.isEstimateVehicleLocations,
        isSaveSettings: tLayers.isSaveSettings
    };
}

function updateSettingsFromJSON(json) {
    if (json.isEstimateVehicleLocations !== undefined) {
        tLayers.isEstimateVehicleLocations = json.isEstimateVehicleLocations;
    }
    if (json.isSaveSettings !== undefined) {
        tLayers.isSaveSettings = json.isSaveSettings;
    }
}


var earthCircumference = 40075000;
var yToLatitudeScale = 360. / earthCircumference;
var degToRad = Math.PI / 180.;

// Lat-long of Downtown Crossing, stop id = place-dwnxg
var refLatitude = 42.355518000000004;
var refLongitude = -71.060225;
var xToLongitudeScale = yToLatitudeScale / Math.cos(refLatitude * degToRad);

function xToLongitude(x) {
    return x * xToLongitudeScale + refLongitude;
}

function longitudeToX(longitude) {
    return (longitude - refLongitude) / xToLongitudeScale;
}

function yToLatitude(y) {
    return y * yToLatitudeScale + refLatitude;
}

function latitudeToY(latitude) {
    return (latitude - refLatitude) / yToLatitudeScale;
}

function verticesToLatitudeLongitude(latitude, longitude, bearingDeg, xys, latLongs) {
    // We're very small scale compared to the earth, we'll just approximate the latitude/longitudes.
    // Of course if the latitude is near the poles, we're screwed...
    var bearingRad = (90 - bearingDeg) * degToRad;
    var cosB = Math.cos(bearingRad);
    var sinB = Math.sin(bearingRad);
    var longScale = yToLatitudeScale / Math.cos(latitude * degToRad);
    
    latLongs.length = xys.length;
    for (let i = xys.length - 1; i >= 0; --i) {
        let x = xys[i][0];
        let y = xys[i][1];
        latLongs[i] = [
            latitude + (x * cosB + y * sinB) * yToLatitudeScale,
            longitude + (-x * sinB + y * cosB) * longScale
        ];
    }
}


class LayerEntry {
    constructor(id, jsonData, mapLayer) {
        this._id = id;
        this._jsonData= jsonData;
        this._mapLayer = mapLayer;
        this._markCount = 0;

        this._isShowing = false;
        this._isLayerInMap = false;
        
        this._visibleCount = 0;
    }
    
    get id() { return this._id; }
    get jsonData() { return this._jsonData; }
    
    // The mark count is used for a mark and sweep type of detection.
    get markCount() { return this._markCount; }
    mark() { ++this._markCount; }
    
    clearMark() { this._markCount = 0; }
    
    
    get mapLayer() { return this._mapLayer; }
    set mapLayer(mapLayer) {
        if (this._mapLayer !== mapLayer) {
            if (this._isLayerInMap) {
                map.removeLayer(this._mapLayer);
            }
            this._mapLayer = mapLayer;
            if (this._isLayerInMap) {
                if (this._mapLayer) {
                    this._mapLayer.addTo(map);
                }
                else {
                    this._isLayerInMap = false;
                }
            }
        }
    }
    
    show() {
        if (this._mapLayer) {
            if (this.isTypeDisplayed()) {
                if (!this._isLayerInMap) {
                    this._mapLayer.addTo(map);
                    this._isLayerInMap = true;
                }
            }
        }
        this._isShowing = true;

        return this;
    }
    
    hide() {
        if (this._isShowing) {
            if (this._isLayerInMap) {
                if (this._mapLayer) {
                    map.removeLayer(this._mapLayer);                    
                }
                this._isLayerInMap = false;
            }
            this._isShowing = false;
        }
        return this;
    }
    
    isTypeDisplayed() {
        return true;
    }
};


function markIfRouteId(map, routeId) {
    map.forEach((entry) => {
        if (entry.routeId === routeId) {
            entry.mark();
        }
    });
}



/*
Stop:
{
  "data": {
    "attributes": {
      "address": null,
      "description": null,
      "latitude": 42.416412,
      "location_type": 0,
      "longitude": -71.196852,
      "name": "Wadsworth Rd @ Homer Rd",
      "platform_code": null,
      "platform_name": null,
      "wheelchair_boarding": 0
    },
    "id": "2465",
    "links": {
      "self": "/stops/2465"
    },
    "relationships": {
      "child_stops": {},
      "facilities": {
        "links": {
          "related": "/facilities/?filter[stop]=2465"
        }
      },
      "parent_station": {
        "data": null
      }
    },
    "type": "stop"
  },
  "jsonapi": {
    "version": "1.0"
  }
}
*/

class StopLayerEntry extends LayerEntry {
    constructor(stopId, jsonData, mapLayer) {
        super(stopId, jsonData, mapLayer);
        this._x = longitudeToX(this.longitude);
        this._y = latitudeToY(this.latitude);
    }
    
    get name() { return this.jsonData.attributes.name; }
    get latitude() { return this.jsonData.attributes.latitude; }
    get longitude() { return this.jsonData.attributes.longitude; }
    get x() { return this._x; }
    get y() { return this._y; }
    
    get parentStationId() { return (this._jsonData.relationships.parent_station
                && this._jsonData.relationships.parent_station.data)
        ? this._jsonData.relationships.parent_station.data.id
        : undefined;
    }
    
    
    isTypeDisplayed() {
        return tLayers.isStopsDisplayed;
    }
    
    getStopMsgFromPredictions(predictionEntries) {
        var msg = '<div>' + this.name;
        if (this.jsonData.attributes.location_type === 0) {
            msg += ' (' + this.id + ')';
        }
        msg += '</div>';
        if (predictionEntries) {
            // We only want the first prediction for each route.
            var visitedRoutes = new Set();
            predictionEntries.forEach((predictionEntry) => {
                var routeId = predictionEntry.routeId + ' ' + predictionEntry.directionId;
                if (visitedRoutes.has(routeId)) {
                    return;
                }
                
                var predictionMsg = predictionEntry.getPredictionMsg();
                if (!predictionMsg) {
                    return;
                }
                
                visitedRoutes.add(routeId);
                msg += '<div>' + predictionEntry.routeName + ': ' + predictionMsg + '</div>';
            });
        }
        return msg;
    }
};


/*
Shape:
{
  "data": {
    "attributes": {
      "direction_id": 1,
      "name": "Harvard",
      "polyline": "ei{aGfcpqL_@`BUjAQjAI~@Kp@E\\[nBCJ??GXq@vDkA~GWe@c@w@c@q@_@i@MO??MOi@i@s@g@]Sc@]c@y@a@aASk@M_@CIKi@Ca@?iA@cA??@WA{AGaAc@cDG}@De@??BWb@gAp@mAVw@?EB]??B_@Cy@U{@sAaDyAmEa@kA??ISk@wB[kACk@HaAVy@TmAh@S@???v@QlA_@~@]~CaB??NIzI}GXU??dEeDnAeA??NMzAgAz@q@r@_@]Qe@_@m@}@a@i@ESCW?WBSBO?ELSL_@Dc@?c@Ge@Ma@M[QE??c@KWBYLURO\\K\\Gd@@`@?B??FZRZ|@p@d@f@^b@`@h@l@|@d@^\\PZD????l@AfCW\\E??rBUvAMr@IVCn@Ir@I^EDg@??B_@XoGF}@NwB??BWFw@l@mFnA_Il@cD??BKF]p@aDJe@??Rw@lB}Gt@mC?A??b@qBb@uBxBeId@_Bt@oBlAqCv@sBl@mB`@aB??DOXeBf@bAd@r@RTlBbDh@z@\\Y??p@k@\\_@`BaBZYfBcB??LM`@_@bBaBbBaB??LMz@e@bBs@ZO??XM`Ac@vAo@ZQh@YTSPWP]d@oAZy@??HS`AgCh@yA\\y@PWd@i@`@SVKn@M\\E??FAdCk@z@Q??PExA]pBa@nAYnAYbAWd@K\\G??v@OrAYvA]??PEtCk@TEFiA??HsA@_@B_AJiBZ}E?e@???W`@wFXsEZ_E??BU`@yDVeCZsCHk@H_@??FWp@sFPoA??Fe@LkAl@eD??N{@PeAn@w@LKFEHGDGDIDU`@aA`BcDlAyBb@y@R[LKNG??@AJEHIDM@K?IAICKEUCSAg@AKTu@f@wA~@oC??HSdA{C|@mC??FS`AsC~@uC`B{El@cB??HS~AqENc@rAuDl@aBj@uAHO??j@mA|@cB\\w@\\m@`@u@b@_A??HS^{@pBqELW??HSnBoEn@sA??HQlAuCr@}AfAcC??LYt@i@`@]t@k@`A{@i@kC_@wBe@qBG{@La@??DONm@fD}@nAa@h@QEEMUJOL]JQJKNEVEf@GtAGTAZAZAl@@h@B\\F??@?j@Nf@Rb@b@P`@Hd@H|@F|@Dz@Bj@Ap@Dp@B|@Nr@PZRVRw@ZaBf@Z\\T",
      "priority": 2
    },
    "id": "780087",
    "links": {
      "self": "/shapes/780087"
    },
    "relationships": {
      "route": {
        "data": {
          "id": "78",
          "type": "route"
        }
      },
      "stops": {
        "data": [
          {
            "id": "2464",
            "type": "stop"
          },
          {
            "id": "2465",
            "type": "stop"
          },
    ...
          {
            "id": "12614",
            "type": "stop"
          },
          {
            "id": "place-harsq",
            "type": "stop"
          },
          {
            "id": "32549",
            "type": "stop"
          }
        ]
      }
    },
    "type": "shape"
  },
  "jsonapi": {
    "version": "1.0"
  }
}
 */
class ShapeLayerEntry extends LayerEntry {
    constructor(shapeId, jsonData, mapLayer, vertices) {
        super(shapeId, jsonData, mapLayer);
        
        this._vertices = vertices;
        
    }
    
    get routeId() { return this.jsonData.relationships.route.data.id; }
    get directionId() { return this.jsonData.attributes.direction_id; }    

    mark() {
        super.mark();
        this.jsonData.relationships.stops.data.forEach((stop) => {
            var stopId = stop.id;
            var stopEntry = stops.get(stopId);
            if (stopEntry) {
                stopEntry.mark();
            }
        });
    }
       
    isTypeDisplayed() {
        return tLayers.isShapesDisplayed;
    }
    
    getVertexIndexForStopId(stopId) {
        return (this._stopIdVertexIndices) ? this._stopIdVertexIndices.get(stopId) : undefined;
    }
    
    getVertexX(vertexIndex) {
        return this._vertexXs[vertexIndex];
    }
    getVertexY(vertexIndex) {
        return this._vertexYs[vertexIndex];
    }
    
    getSegmentLength(segmentIndex) {
        return this._segmentLengths[segmentIndex];
    }
    getSegmentStopId(segmentIndex) {
        return this._segmentStopIds[segmentIndex];
    }
    
    stopsUpdated() {
        this._segmentLengths = [];
        this._stopIdVertexIndices = new Map();
        this._segmentStopIds = [];
        this._vertexXs = [];
        this._vertexYs = [];

        var jsonStops = this.jsonData.relationships.stops.data;
        
        // First stop is at vertex 0, last stop is at last vertex.
        // Walk along the vertices until we get to one close to the stop.
        var lastX = longitudeToX(this._vertices[0][1]);
        var lastY = latitudeToY(this._vertices[0][0]);
        this._vertexXs.push(lastX);
        this._vertexYs.push(lastY);
        
        this._stopIdVertexIndices.set(jsonStops[0].id, 0);
        
        var vertexCount = this._vertices.length;
        var lastStopIndex = jsonStops.length - 1;
        var nextStopIndex = 1;
        var stopEntry = stops.get(jsonStops[nextStopIndex].id);
        if (!stopEntry) {
            return;
        }
        
        
        var stopTolerance = 200;
        
        var lastDistance = Number.MAX_VALUE;

        for (let v = 1; v < vertexCount; ++v) {
            var x = longitudeToX(this._vertices[v][1]);
            var y = latitudeToY(this._vertices[v][0]);
            this._vertexXs.push(x);
            this._vertexYs.push(y);
            
            var dx = x - lastX;
            var dy = y - lastY;
            var segLength = Math.sqrt(dx * dx + dy * dy);
            this._segmentLengths.push(segLength);
            this._segmentStopIds.push(jsonStops[nextStopIndex].id);
            
            if (nextStopIndex >= lastStopIndex) {
                continue;
            }
            
            if (segLength < 1) {
                continue;
            }
            
            lastX = x;
            lastY = y;

            var distance = this.distanceToSegment(v - 1, stopEntry.x, stopEntry.y);
            if (distance > stopTolerance) {
                if (lastDistance === Number.MAX_VALUE) {
                    continue;
                }
            }
            else {
                if (distance < lastDistance) {
                    // Still going...
                    lastDistance = distance;
                    continue;
                }
            }
            
            // The vertex we want is actually the previous vertex.
            this._stopIdVertexIndices.set(jsonStops[nextStopIndex].id, v - 1);
            ++nextStopIndex;
            
            stopEntry = stops.get(jsonStops[nextStopIndex].id);
            if (!stopEntry) {
                console.log("ShapeLayerEntry.stopsUpdated() stop entry '" + jsonStops[nextStopIndex].id + "' not found.");
                return;
            }
            
            this._segmentStopIds[v - 1] = jsonStops[nextStopIndex].id;
            
            lastDistance = Number.MAX_VALUE;
        }
        
        if ((nextStopIndex + 1) === lastStopIndex) {
            // Didn't finish the last vertex...
            this._stopIdVertexIndices.set(jsonStops[nextStopIndex].id, vertexCount - 2);
            ++nextStopIndex;
        }
        this._stopIdVertexIndices.set(jsonStops[lastStopIndex].id, vertexCount - 1);

        if (nextStopIndex !== lastStopIndex) {
            console.log("ShapeLayerEntry.stopsUpdated() nextStopIndex = " + nextStopIndex + " lastStopIndex = " + lastStopIndex);
        }
        
        if (dumpShapeInfo) {
            console.log("ShapeInfo Dump:\t" + this.id);
            console.log("Stops:");
            jsonStops.forEach((stop) => {
                var stopEntry = stops.get(stop.id);
                var stopVertex = this._stopIdVertexIndices.get(stop.id);
                if (stopEntry) {
                    console.log("Stop:\t" + stop.id 
                            + "\t" + stopEntry.latitude + "\t" + stopEntry.longitude + "\t"
                            + "\t" + stopEntry.x + "\t" + stopEntry.y + "\t"
                            + "\t" + stopVertex);
                }
            });
            console.log("Vertices:");
            var segmentCount = vertexCount - 1;
            for (let v = 0; v < segmentCount; ++v) {
                console.log("Vertex:\t" + v 
                        + "\t" + this._vertices[v][0] + "\t" + this._vertices[v][1] + "\t"
                        + "\t" + this._vertexXs[v] + "\t" + this._vertexYs[v] + "\t"
                        + "\t" + this._segmentStopIds[v] + "\t"
                        + "\t" + this._segmentLengths[v]);
            }
            console.log("Vertex:\t" + segmentCount
                    + "\t" + this._vertices[segmentCount][0] + "\t" + this._vertices[segmentCount][1] + "\t"
                    + "\t" + this._vertexXs[segmentCount] + "\t" + this._vertexYs[segmentCount]);
            console.log("End ShapeInfoDump");
        }
    }
    
    
    distanceToSegment(segmentIndex, x, y) {
        var segDx = this._vertexXs[segmentIndex + 1] - this._vertexXs[segmentIndex];
        var segDy = this._vertexYs[segmentIndex + 1] - this._vertexYs[segmentIndex];
        var dx = x - this._vertexXs[segmentIndex];
        var dy = y - this._vertexYs[segmentIndex];
        var segmentLength = this._segmentLengths[segmentIndex];
        var u = (segmentLength > 1) ? (dx * segDx + dy * segDy) / (segmentLength * segmentLength) : -1;
        if (u < 0) {
            return Math.sqrt(dx * dx + dy * dy);
        }
        else if (u > 1) {
            return this.distanceToVertex(segmentIndex + 1, x, y);
        }
        
        var xSeg = segDx * u;
        var ySeg = segDy * u;
        dx -= xSeg;
        dy -= ySeg;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    distanceToVertex(vertexIndex, x, y) {
        var dx = x - this._vertexXs[vertexIndex];
        var dy = y - this._vertexYs[vertexIndex];
        return Math.sqrt(dx * dx + dy * dy);
    }
};



/*
Trip:
{
  "data": {
    "attributes": {
      "block_id": "T78-43",
      "direction_id": 1,
      "headsign": "Harvard",
      "name": "",
      "wheelchair_accessible": 1
    },
    "id": "37476146",
    "links": {
      "self": "/trips/37476146"
    },
    "relationships": {
      "route": {
        "data": {
          "id": "78",
          "type": "route"
        }
      },
      "service": {
        "data": {
          "id": "BUS32018-hbt38017-Sunday-02",
          "type": "service"
        }
      },
      "shape": {
        "data": {
          "id": "780087",
          "type": "shape"
        }
      }
    },
    "type": "trip"
  },
  "jsonapi": {
    "version": "1.0"
  }
}
*/
class TripLayerEntry extends LayerEntry {
    constructor(tripId, jsonData) {
        super(tripId, jsonData);
        this._shapeId = jsonData.relationships.shape.data ? jsonData.relationships.shape.data.id : null;
    }
    
    get headsign() { return this.jsonData.attributes.headsign; }
    get routeId() { return this.jsonData.relationships.route.data.id; }
    get shapeId() { return this._shapeId; }
    
       
    isTypeDisplayed() {
        return false;
    }
}


/*
Vehicle:
{
  "data": [
    {
      "attributes": {
        "bearing": 0,
        "current_status": "IN_TRANSIT_TO",
        "current_stop_sequence": 2,
        "direction_id": 0,
        "label": "1923",
        "latitude": 42.3749885559082,
        "longitude": -71.11891174316406,
        "speed": null,
        "updated_at": "2018-07-17T18:17:20-04:00"
      },
      "id": "y1923",
      "links": {
        "self": "/vehicles/y1923"
      },
      "relationships": {
        "route": {
          "data": {
            "id": "72",
            "type": "route"
          }
        },
        "stop": {
          "data": {
            "id": "2170",
            "type": "stop"
          }
        },
        "trip": {
          "data": {
            "id": "37472385",
            "type": "trip"
          }
        }
      },
      "type": "vehicle"
    }
  ],
  "jsonapi": {
    "version": "1.0"
  }
} 
*/    

class VehicleLayerEntry extends LayerEntry {
    constructor(vehicleId, jsonData, vehicleMarker) {
        var mapLayer = vehicleMarker ? vehicleMarker.mapLayer : undefined;
        super(vehicleId, jsonData, mapLayer);
        this._vehicleMarker = vehicleMarker;

        if (this._vehicleMarker) {
            this._vehicleMarker.updateMarkerPosition(this);
        }
    }
    
    get routeId() { return this.jsonData.relationships.route.data.id; }
    get tripId() { return this.jsonData.relationships.trip.data.id; }
    get stopId() { return this.jsonData.relationships.stop.data.id; }
    get currentStatus() { return this.jsonData.attributes.current_status; }
    
    get color() { return this.jsonData.attributes.color; }
    get direction() { return this.jsonData.attributes.direction_id; }
    get latitude() { return this.jsonData.attributes.latitude; }
    get longitude() { return this.jsonData.attributes.longitude; }
    get bearing() { return this.jsonData.attributes.bearing; }
    get updatedAt() { return this.jsonData.attributes.updated_at; }
    
    
    updateJSONData(jsonData) {
        var lastRouteId = this.routeId;
        var lastTripId = this.tripId;
        
        this._jsonData = jsonData;

        // If we have a marker, update the marker...
        if (this._vehicleMarker) {
            this._vehicleMarker.updateMarkerPosition(this);
        }
    }
       
    isTypeDisplayed() {
        return tLayers.isVehiclesDisplayed;
    }
    
    getVehicleMsgFromPredictions(predictionEntries) {
        var msg = '<div>';
        var routeEntry = routes.get(this.routeId);
        if (routeEntry) {
            msg += routeEntry.name + ' ' + routeEntry.directionNames[this.direction];
        }
        else {
            msg += this.routeId;
        }
        msg += '</div>';

        if (predictionEntries && predictionEntries.length) {
            var predictionMsg = predictionEntries[0].getPredictionMsg();
            if (predictionMsg) {
                var stopName = predictionEntries[0].stopName;
                if (!stopName) {
                    // TEST!!!
                    stopName = predictionEntries[0].stopId;
                }
                if (stopName) {
                    stopName += ': ';
                }
                msg += '<div>' + stopName + predictionMsg + '</div>';
            }
        }
            
        msg += '<div>Vehicle: ' + this.id + '</div>';
        msg += '<div>Bearing: ' + this.bearing + '</div>';
        msg += '<div>Last updated: ' + this.updatedAt + '</div>';
        return msg;
    }
}

/*
Route:
{
  "data": [
    {
      "attributes": {
        "color": "FFC72C",
        "description": "Local Bus",
        "direction_names": [
          "Outbound",
          "Inbound"
        ],
        "long_name": "",
        "short_name": "78",
        "sort_order": 7800,
        "text_color": "000000",
        "type": 3
      },
      "id": "78",
      "links": {
        "self": "/routes/78"
      },
      "type": "route"
    }
  ],
  "jsonapi": {
    "version": "1.0"
  }
} 
*/    

class RouteLayerEntry extends LayerEntry {
    constructor(routeId, jsonData, mapLayer) {
        super(routeId, jsonData, mapLayer);
    }
    
    get routeType() { return this.jsonData.attributes.type; }
    get name() {
        var attributes = this.jsonData.attributes;
        var text = '';
        if (attributes.type === ROUTE_BUS) {
            text = "Bus " + this.id + ": ";
        }
        text += (attributes.long_name) 
            ? attributes.long_name : attributes.short_name; 
        return text;
    }
    get directionNames() { return this.jsonData.attributes.direction_names; }
    
    mark() {
        super.mark();
        var routeId = this.id;
        markIfRouteId(vehicles, routeId);
        markIfRouteId(shapes, routeId);
    }
       
    isTypeDisplayed() {
        return false;
    }
}


class VehicleMarker {
    constructor(vertices, options) {
        this._vertices = vertices;
        this._latLongs = [];
        verticesToLatitudeLongitude(42, -72, 0, vertices, this._latLongs);
        
        this._mapLayer = L.polygon(this._latLongs, options);
        this._positionEstimated = false;
    }
    
    get mapLayer() { return this._mapLayer; }
    
    updateMarkerPosition(vehicleLayerEntry) {
        if (this._mapLayer) {
            if (!this._estimateVehiclePosition(vehicleLayerEntry)) {
                verticesToLatitudeLongitude(vehicleLayerEntry.latitude, vehicleLayerEntry.longitude,
                    vehicleLayerEntry.bearing, this._vertices, this._latLongs);
                this._mapLayer.setLatLngs(this._latLongs);
            }
            
            var opacity;
            var date = new Date(vehicleLayerEntry.updatedAt);
            if (!Number.isNaN(date.getHours())) {
                var ageMilliseconds = tLayers.currentUpdateDate - date.valueOf();
                ageMilliseconds = Math.max(0, ageMilliseconds);
                ageMilliseconds = Math.min(ageMilliseconds, tLayers.maxTimeStampFadeMilliSeconds);
                var scale = ageMilliseconds / tLayers.maxTimeStampFadeMilliSeconds;
                opacity = 1 - scale * 0.8;
            }
            else {
                opacity = 0.2;
            }
            
            this._mapLayer.setStyle({ 
                stroke: this._positionEstimated,
                color: 'yellow',
                weight: 1,
                opacity: 1,
                fillOpacity: opacity 
            });
        }
    }
    
    _clearEstimateState() {
        this._lastBearing = undefined;
    }
    
    _trackMe(vehicleLayerEntry, msg2) {
        this._trackId = (this._trackId | 0) + 1;
        var vehicleX = longitudeToX(vehicleLayerEntry.longitude);
        var vehicleY = latitudeToY(vehicleLayerEntry.latitude);
        
        var msg = '\tTrackMe: ' + this._trackId;
        msg += '\t' + new Date().toLocaleString();
        msg += '\t' + vehicleLayerEntry.id + '\t' + vehicleLayerEntry.routeId;
        msg += '\t' + vehicleLayerEntry.currentStatus + '\t' + vehicleLayerEntry.stopId;
        msg += '\t' + vehicleLayerEntry.updatedAt;
        msg += '\t' + vehicleX + '\t' + vehicleY + '\t' + vehicleLayerEntry.bearing + '\t\t' + msg2;
        console.log(msg);
    }

    _estimateVehiclePosition(vehicleLayerEntry) {
        var isTrackMe = false;
        //isTrackMe = (vehicleLayerEntry.routeId === '78') && (vehicleLayerEntry.direction === '1');
        //isTrackMe = (vehicleLayerEntry.id === 'y1426');
        //isTrackMe = (vehicleLayerEntry.id === 'y1892') && this._enableTrackMe;
        
        this._positionEstimated = false;
        
        if (!tLayers.isEstimateVehicleLocations) {
            return false;
        }
        
        if (!vehicleLayerEntry.predictions || !vehicleLayerEntry.predictions.length) {
            if (isTrackMe) {
                this._trackMe(vehicleLayerEntry, 'No predictions');
            }
            this._clearEstimateState();
            return false;
        }
        
        var prediction = vehicleLayerEntry.predictions[0];
        
        // Reported position and time.
        var reportedLatitude = vehicleLayerEntry.latitude;
        var reportedLongitude = vehicleLayerEntry.longitude;
        var reportedTime = new Date(vehicleLayerEntry.updatedAt).valueOf();
        if ((tLayers.currentUpdateDate - reportedTime) < tLayers.vehiclePositionTimeToleranceMilliSeconds) {
            if (isTrackMe) {
                this._trackMe(vehicleLayerEntry, 'Last updated time current');
            }
            this._clearEstimateState();
            return false;
        }
        

        var predictionTime = new Date(prediction.time).valueOf();
        var deltaTime = predictionTime - reportedTime;
        if (deltaTime < tLayers.vehiclePositionTimeToleranceMilliSeconds) {
            if (isTrackMe) {
                this._trackMe(vehicleLayerEntry, 'Last updated time close to prediction time');
            }
            this._clearEstimateState();
            return false;
        }
        
        var tripId = vehicleLayerEntry.tripId;
        var tripEntry = trips.get(tripId);
        if (!tripEntry) {
            if (isTrackMe) {
                this._trackMe(vehicleLayerEntry, 'No trip entry\t' + tripId);
            }
            this._clearEstimateState();
            return false;
        }
        
        var shapeEntry = shapes.get(tripEntry.shapeId);
        if (!shapeEntry) {
            if (isTrackMe) {
                this._trackMe(vehicleLayerEntry, 'No shape entry\t' + tripEntry.shapeId);
            }
            this._clearEstimateState();
            return false;
        }
        
        var stopId = prediction.stopId;
        var stopEntry = stops.get(stopId);
        if (stopEntry) {
            if (stopEntry.parentStationId) {
                stopId = stopEntry.parentStationId;
            }
        }
        var nextStopVertexIndex = shapeEntry.getVertexIndexForStopId(stopId);
        // Both undefined and index === 0 are return false.
        if (!nextStopVertexIndex) {
            if (isTrackMe) {
                this._trackMe(vehicleLayerEntry, 'nextStopVertexIndex\t' + nextStopVertexIndex);
            }
            this._clearEstimateState();
            return false;
        }
        
        var latitude = reportedLatitude;
        var longitude = reportedLongitude;
        
        var vehicleX = longitudeToX(vehicleLayerEntry.longitude);
        var vehicleY = latitudeToY(vehicleLayerEntry.latitude);
        
        var segmentIndex = nextStopVertexIndex - 1;
        var minDistance = shapeEntry.distanceToSegment(segmentIndex, vehicleX, vehicleY);
        var minSegmentIndex = segmentIndex;
        var minDistanceFromStop = 0;
        var distanceFromStop = shapeEntry.getSegmentLength(segmentIndex);
        --segmentIndex;
        while (segmentIndex > 0) {
            var distanceToSegment = shapeEntry.distanceToSegment(segmentIndex, vehicleX, vehicleY);
            if (distanceToSegment < minDistance) {
                minSegmentIndex = segmentIndex;
                minDistance = distanceToSegment;
                minDistanceFromStop = distanceFromStop;
            }

            distanceFromStop += shapeEntry.getSegmentLength(segmentIndex);
            --segmentIndex;
        }
        
        if ((minSegmentIndex < 0) || (minDistance > 500)) {
            if (minSegmentIndex >= 0) {
                if (isTrackMe) {
                    this._trackMe(vehicleLayerEntry, 'Not close to any segment\t' + minDistance + '\t' + vehicleLayerEntry.currentStatus);
                }
/*                console.log("To far from path: " + minDistance 
                        + " Route: " + vehicleLayerEntry.routeId 
                        + " Stop: " + stopId 
                        + " Current Status:" + vehicleLayerEntry.currentStatus);
*/
            }
            this._clearEstimateState();
            return false;
        }
        
        var dbgDistanceFromStop = distanceFromStop;
        
        distanceFromStop = minDistanceFromStop;
        var distanceFromVertex = shapeEntry.distanceToVertex(minSegmentIndex + 1, vehicleX, vehicleY);
        distanceFromStop += distanceFromVertex;
        
        var timeFraction = (predictionTime - Date.now()) / deltaTime;
        if (timeFraction < 0) {
            timeFraction = 0;
        }
        var estimatedDistanceFromStop = distanceFromStop * timeFraction;
        var initialEstimatedDistanceFromStop = estimatedDistanceFromStop;
        
        var bearing = vehicleLayerEntry.bearing;
        
        // TEST!!!
/*        if (isTrackMe) {
            // 107
            estimatedDistanceFromStop = initialEstimatedDistanceFromStop = 549.26913025039;
            timeFraction = 0.55784962406015;
            minDistanceFromStop = 972.271477071586;
            distanceFromVertex = 12.3471487378034;
            minDistance = 8.24545051286719;
            distanceFromStop = minDistanceFromStop + distanceFromVertex;
            nextStopVertexIndex = 125;
            minSegmentIndex = 113;
            vehicleX = -2714.55125327073;
            vehicleY = 301.964103121892;
            stopId = '77';
            stopEntry = stops.get(stopId);
        }
 */       

        var endSegmentIndex = nextStopVertexIndex;
        segmentIndex = nextStopVertexIndex - 1;
        var startSegmentIndex = segmentIndex;
        var u = 0;
        while (estimatedDistanceFromStop > 0) {
            var segmentLength = shapeEntry.getSegmentLength(segmentIndex);
            if (segmentLength >= estimatedDistanceFromStop) {
                u = estimatedDistanceFromStop / segmentLength;
                break;
            }

            estimatedDistanceFromStop -= segmentLength;

            if (segmentLength > 0) {
                endSegmentIndex = segmentIndex;
            }
            
            --segmentIndex;
            
            if (segmentIndex < 0) {
                // Something bad happened...
                if (isTrackMe) {
                    var msg = 'segmentIndexNegative';
                    msg += '\t' + initialEstimatedDistanceFromStop;
                    msg += '\t' + timeFraction;
                    msg += '\t' + minDistanceFromStop;
                    msg += '\t' + distanceFromVertex;
                    msg += '\t' + minDistance;
                    msg += '\t' + nextStopVertexIndex;
                    msg += '\t' + minSegmentIndex;
                    msg += '\t' + stopId;
                    msg += '\t' + stopEntry.name;
                    msg += '\t' + prediction.time;
                    
                    this._trackMe(vehicleLayerEntry, msg);
                }
                return false;
            }
        }
                
        var endX = shapeEntry.getVertexX(endSegmentIndex);
        var endY = shapeEntry.getVertexY(endSegmentIndex);
        var startX = shapeEntry.getVertexX(segmentIndex);
        var startY = shapeEntry.getVertexY(segmentIndex);
        var dx = startX - endX;
        var dy = startY - endY;
        if (estimatedDistanceFromStop < 10) {
            // Close enough, just move to the end vertex of the segment.
            vehicleX = endX;
            vehicleY = endY;
        }
        else {
            vehicleX = endX + u * dx;
            vehicleY = endY + u * dy;
        }
        
        if (dx && dy) {
            bearing = 270 - Math.atan2(dy, dx) / degToRad;
        }
        else if (this._lastBearing !== undefined) {
            bearing = this._lastBearing;
        }
        
        if (isTrackMe) {
            var msg = 'Updating Position:';
            msg += '\t' + initialEstimatedDistanceFromStop;
            msg += '\t' + timeFraction;
            msg += '\t' + minDistanceFromStop;
            msg += '\t' + distanceFromVertex;
            msg += '\t' + minDistance;
            msg += '\t' + nextStopVertexIndex;
            msg += '\t' + minSegmentIndex;
            msg += '\t' + stopId;
            msg += '\t' + stopEntry.name;
            msg += '\t' + prediction.time;
            msg += '\t';
            msg += '\t' + vehicleX + '\t' + vehicleY + '\t' + bearing;
            msg += '\t' + dx + '\t' + dy;
            msg += '\t' + endSegmentIndex + '\t' + segmentIndex;
            
            if (this._lastStopId) {
                msg += '\t' + this._lastVehicleStopId;
                msg += '\t' + this._lastStopId;
            }

            this._trackMe(vehicleLayerEntry, msg);
        }
        
        if (isTrackMe) {
            var currentId = Number.parseInt(stopId);
            var lastId = Number.parseInt(this._lastStopId);
            if (!Number.isNaN(currentId) && !Number.isNaN(lastId)) {
                if (currentId < 1000 && lastId < 1000 && currentId < lastId) {
                    if (stopId < this._lastStopId) {
                        console.log("Current Predictions:");
                        vehicleLayerEntry.predictions.forEach((prediction) => {
                            console.log(prediction.stopSequence + '\t' + prediction.stopId + '\t' + prediction.time);
                        });
                        console.log("Prev Predictions:");
                        this._lastPredictions.forEach((prediction) => {
                            console.log(prediction.stopSequence + '\t' + prediction.stopId + '\t' + prediction.time);
                        });
                    }
                }
            }
        }
        
        // 
        longitude = xToLongitude(vehicleX);
        latitude = yToLatitude(vehicleY);
        
        verticesToLatitudeLongitude(latitude, longitude,
            bearing, this._vertices, this._latLongs);
        this._mapLayer.setLatLngs(this._latLongs);
        this._lastBearing = bearing;
        
        this._positionEstimated = true;
        
        this._lastVehicleStopId = vehicleLayerEntry.stopId;
        this._lastStopId = stopId;
        this._lastPredictions = vehicleLayerEntry.predictions;
        
        this._enableTrackMe = vehicleY >= -880;
        
        return true;
    }
}


var lightRailVertices = [
    [0, 0],
    [50, -50],
    [50, -150],
    [0, -100],
    [-50, -150],
    [-50, -50]
];

class LightRailMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        super(lightRailVertices, {
            fillColor: 'DarkGreen',
            fillOpacity: 1,
            weight: 0
        });
    }    
}

var heavyRailVertices = [
    [0, 0],
    [50, -50],
    [50, -200],
    [0, -150],
    [-50, -200],
    [-50, -50]
];

class HeavyRailMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        var color;
        switch (routeLayerEntry.id) {
            case 'Red' :
                color = 'DarkRed';
                break;
                
            case 'Orange' :
                color = 'DarkOrange';
                break;
                
            case 'Blue' :
                color = 'DarkBlue';
                break;
        }
        
        super(heavyRailVertices, {
                fillColor: color,
                fillOpacity: 1,
                color: color,
                opacity: 0.5,
                weight: 0
            });
    }
    
}

var commuterRailVertices = [
    [0, 0],
    [50, -50],
    [50, -250],
    [0, -200],
    [-50, -250],
    [-50, -50]
];

class CommuterRailMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        super(commuterRailVertices, {
            fillColor: 'purple',
            fillOpacity: 1,
            weight: 0
        });
    }    
}

var busHWidth = 30;
var busVertices = [
    [0, 0],
    [busHWidth, -busHWidth],
    [busHWidth, -100],
    [0, -100 + busHWidth],
    [-busHWidth, -100],
    [-busHWidth, -busHWidth]
    //[0, 140 * 12 / 39.37]
];
class BusMarker extends VehicleMarker {
    constructor(routeLayerEntry) {
        super(busVertices, {
            fillColor: 'brown',
            fillOpacity: 1,
            weight: 0
        });
    }
}


var ferryVertices = [
    [0, 0],
    [50, -50],
    [50, -150],
    [0, -100],
    [-50, -150],
    [-50, -50]
    //[0, 140 * 12 / 39.37]
];
class FerryMarker extends VehicleMarker {
    constructor() {
        super(ferryVertices, {
            fillColor: 'white',
            fillOpacity: 1,
            weight: 0
        });
    }
}


/*
Prediction:
{
  "data": [
    {
      "attributes": {
        "arrival_time": null,
        "departure_time": "2018-07-29T10:56:28-04:00",
        "direction_id": 0,
        "schedule_relationship": null,
        "status": null,
        "stop_sequence": 1
      },
      "id": "prediction-37476169-20761-1",
      "relationships": {
        "route": {
          "data": {
            "id": "725",
            "type": "route"
          }
        },
        "stop": {
          "data": {
            "id": "20761",
            "type": "stop"
          }
        },
        "trip": {
          "data": {
            "id": "37476169",
            "type": "trip"
          }
        }
      },
      "type": "prediction"
    },
...
    {
      "attributes": {
        "arrival_time": "2018-07-29T11:13:54-04:00",
        "departure_time": "2018-07-29T11:13:54-04:00",
        "direction_id": 0,
        "schedule_relationship": null,
        "status": null,
        "stop_sequence": 26
      },
      "id": "prediction-37476169-2135-26",
      "relationships": {
        "route": {
          "data": {
            "id": "72",
            "type": "route"
          }
        },
        "stop": {
          "data": {
            "id": "2135",
            "type": "stop"
          }
        },
        "trip": {
          "data": {
            "id": "37476169",
            "type": "trip"
          }
        }
      },
      "type": "prediction"
    }
  ],
  "jsonapi": {
    "version": "1.0"
  }
} */
class PredictionEntry {
    constructor(jsonData) {
        this._jsonData = jsonData;
    }
    
    get directionId() { return this._jsonData.attributes.direction_id; }
    
    get routeId() { return this._jsonData.relationships.route.data.id; }
    get routeName() {
        var routeId = this.routeId;
        var entry = routes.get(routeId);
        if (entry) {
            var direction = entry.directionNames[this.directionId];
            if (direction) {
                return entry.name + ' ' + direction;
            }
            return entry.name;
        }
        return routeId;
    }
    
    get stopId() { return this._jsonData.relationships.stop.data.id; }
    get stopName() {
        var stopId = this.stopId;
        var entry = stops.get(stopId);
        if (entry) {
            return entry.name;
        }
        return '';
    }
    get stopSequence() { return this._jsonData.attributes.stop_sequence; }
    
    get tripId() { return this._jsonData.relationships.trip.data.id; }
    
    get arrivalTime() { return this._jsonData.attributes.arrival_time; }
    get deparatureTime() { return this._jsonData.attributes.departure_time; }
    get time() { return (this._jsonData.attributes.arrival_time)
        ? this._jsonData.attributes.arrival_time
        : this._jsonData.attributes.departure_time;
    }
    
    getPredictionMsg() {        
        var arrival = this.arrivalTime;
        var departure = this.departureTime;
        if (!arrival && !departure) {
            return '';
        }
        
        var msg = '';
        if (arrival === departure) {
            msg += dateToHHMMString(new Date(arrival), true) + ' DEP';
        }
        else {
            if (arrival) {
                msg += dateToHHMMString(new Date(arrival), true) + ' ARR';
                if (departure) {
                    msg += '  ';
                }
            }
            if (departure) {
                msg += dateToHHMMString(new Date(departure), true) + ' DEP';
            }
        }
        return msg;
    }
}

function comparePredictionEntryStopSequence(a, b) {
    return a.stopSequence - b.stopSequence;
}


function dateToHHMMString(time, includeSeconds) {
    if (!time) {
        return '';
    }
    var hours = time.getHours();
    var suffix = " AM";
    if (hours > 12) {
        hours -= 12;
        suffix = " PM";
    }
    else if (hours === 12) {
        suffix = " PM";
    }
    
    hours = hours.toString();
    if (hours.length === 1) {
        hours = " " + hours;
    }

    var minutes = time.getMinutes().toString();
    if (minutes.length === 1) {
        minutes = "0" + minutes;
    }
    
    var seconds = "";
    if (includeSeconds) {
        seconds = time.getSeconds().toString();
        if (seconds.length === 1) {
            seconds = "0" + seconds;
        }
        seconds = ":" + seconds;
    }
    
    return hours + ':' + minutes + seconds + suffix;
}

function isIterable(obj) {
    if (!obj || (typeof obj === 'string') || (obj instanceof String)) {
        return false;
    }
    return typeof obj[Symbol.iterator] === 'function';
}

function fetchMBTA(path) {
    path += '&api_key=73fba3c751464eafb5e3aa78386fcf23';
    return fetch(path);
}


///////////////////////////////////
// Predictions
///////////////////////////////////
function fetchPredictionByStopId(stopId) {
    var path = 'https://api-v3.mbta.com/predictions?filter%5Bstop%5D=';
    path += stopId;
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processPredictionResult(myJson));
}

function fetchPredictionByTripId(tripIds) {
    var path = 'https://api-v3.mbta.com/predictions?filter%5Btrip%5D=';
    if (isIterable(tripIds)) {
        var separator = '';
        for (let tripId of tripIds) {
            path += separator + tripId;
            separator = '%2C';
        }
    }
    else {
        path += tripIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processPredictionResult(myJson));
}

function processPredictionResult(json) {
    var data = json.data;
    var predictions = [];
    data.forEach((dataItem) => {
        predictions.push(processPredictionData(dataItem));
    });
    
    return predictions;
}

function processPredictionData(data) {
    return new PredictionEntry(data);
}


///////////////////////////////////
// Stops
///////////////////////////////////

function fetchStops(stopIds) {
    var path = 'https://api-v3.mbta.com/stops?include=child_stops&filter%5Bid%5D=';
    if (isIterable(stopIds)) {
        var separator = '';
        for (let stopId of stopIds) {
            path += separator + stopId;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += stopIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processStopsResult(myJson));
}


function processStopsResult(json) {
    var data = json.data;
    var childStopIds = new Set();
    var result;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processStopData(data[i], childStopIds));
        }
        
        result = layerEntries;
    }
    else {
        result = processStopData(data, childStopIds);
    }
    
    if (childStopIds.size) {
        stopLayerEntriesPromise(childStopIds);
    }
    
    return result;
}


function processStopData(data, childStopIds) {
    var stopId = data.id;
    var marker;
    switch (data.attributes.location_type) {
        case 0 :    // Stop
            marker = createStopMarker(data);
            break;
            
        case 1 :    // Station
        case 2 :    // Station entrance/exit.
            marker = createStationMarker(data);
            break;
    }
    
    var layerEntry = new StopLayerEntry(stopId, data, marker);
    stops.set(stopId, layerEntry);
    
    // Want to load the predictions for the stop when the tooltip comes up.
    if (marker) {
        marker.bindTooltip(layerEntry.getStopMsgFromPredictions());
        
        marker.on('tooltipopen', (e) => {
            marker.setTooltipContent(layerEntry.getStopMsgFromPredictions());
            fetchPredictionByStopId(stopId)
                    .then((predictionEntries) => {
                        var msg = layerEntry.getStopMsgFromPredictions(predictionEntries);
                        marker.setTooltipContent(msg);
                    });            
        });
    }
    
    if (childStopIds) {
        var childStops = data.relationships.child_stops.data;
        childStops.forEach((childStop) => childStopIds.add(childStop.id));
    }
    
    return layerEntry;
}


var stopSize = 20;
var stopVertices = [
    [stopSize, -stopSize],
    [stopSize, stopSize],
    [-stopSize, stopSize],
    [-stopSize, -stopSize]
];
function createStopMarker(stopJSON) {
    // TODO: Improve this marker...
    var latitude = stopJSON.attributes.latitude;
    var longitude = stopJSON.attributes.longitude;
    var latLongs = [];
    verticesToLatitudeLongitude(latitude, longitude, 0, stopVertices, latLongs);
    var marker = L.polygon(latLongs, { 
        fillColor: 'steelblue',
        weight: 0
    });
    return marker;
}


function createStationMarker(stopJSON) {
    // TODO: Improve this marker...
    var latitude = stopJSON.attributes.latitude;
    var longitude = stopJSON.attributes.longitude;
    var marker = L.circle([latitude, longitude], {
        radius: 100,
        color: 'darkblue',
        opacity: 0,
        fillOpacity: 0.2
    });
    return marker;
}

function stopLayerEntriesPromise(stopId) {
    if (isIterable(stopId)) {
        var idsNeeded = [];
        var existingEntries = [];
        stopId.forEach((id) => {
            var entry = stops.get(id);
            if (entry) {
                existingEntries.push(entry);
            }
            else {
                idsNeeded.push(id);
            }
        });
        
        if (idsNeeded.length > 0) {
            var promises = [];
            var stopsThisPass = [];
            for (let i = idsNeeded.length; i > 0; i -= stopsThisPass.length) {
                var count = Math.min(i, 50);
                stopsThisPass = idsNeeded.slice(i - count, i);
                promises.push(fetchStops(stopsThisPass)
                        .then((stopEntries) => 
                            existingEntries = existingEntries.concat(stopEntries)));
            }
            return Promise.all(promises)
                    .then(() => existingEntries);
        }
        else {
            return Promise.resolve(existingEntries);
        }
    }
    
    var stopEntry = stops.get(stopId);
    if (stopEntry) {
        return Promise.resolve(stopEntry);
    }
    return fetchStops(stopId);
}


///////////////////////////////////
// Shape
///////////////////////////////////

function fetchShapesByRouteIds(routeIds) {
    var path = 'https://api-v3.mbta.com/shapes?filter%5Broute%5D=';
    var routesFilter = '';
    if (isIterable(routeIds)) {
        var separator = '';
        for (let stopId of routeIds) {
            routesFilter += separator + stopId;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        routesFilter += routeIds;
    }
    
    path += routesFilter;
    
    //console.log('Fetching Shapes for route: ' + routesFilter);
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processShapesResult(myJson));
}

function processShapesResult(json) {
    var data = json.data;
    var stopIdsNeeded = new Set();
    var result;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processShapeData(data[i], stopIdsNeeded));
        }
        
        result = layerEntries;
    }
    else {
        result = processShapeData(data, stopIdsNeeded);
    }
    
    if (stopIdsNeeded.size > 0) {
        return stopLayerEntriesPromise(stopIdsNeeded)
                .then(() => {
                    result.forEach((layerEntry) => layerEntry.stopsUpdated());
                    return result;
        });
    }

    return result;
}

function processShapeData(data, stopIdsNeeded) {    
    var shapeId = data.id;
    
    var encoded = data.attributes.polyline;
    var vertices = L.PolylineUtil.decode(encoded);
    var polyline = L.polyline(vertices);
    
    var layerEntry = new ShapeLayerEntry(shapeId, data, polyline, vertices);
    shapes.set(shapeId, layerEntry);
    
    var popupMsg;
    
    var routeEntry = routes.get(layerEntry.routeId);
    if (routeEntry) {
        var style = {};
        if (routeEntry.jsonData.attributes.color !== undefined) {
            style.color = '#' + routeEntry.jsonData.attributes.color;
        }
        style.opacity = 0.5;
        
        switch (routeEntry.routeType) {
            case ROUTE_LIGHT_RAIL :
                style.weight = 4;
                break;
            
            case ROUTE_HEAVY_RAIL :
                style.weight = 4;
                break;
                
            case ROUTE_COMMUTER_RAIL :
                style.weight = 3;
                break;
            
            case ROUTE_BUS :
                style.weight = 2;
                break;
                
            case ROUTE_FERRY :
                style.weight = 3;
                break;
        }

        polyline.setStyle(style);
        
        popupMsg = '<div>' + routeEntry.name + '</div>';
        popupMsg += '<div>' + routeEntry.directionNames[layerEntry.directionId] + '</div>';
    }
        
    polyline.bindPopup(popupMsg);
    
    var shapeStops = data.relationships.stops;
    shapeStops.data.forEach((stopData) => {
        if (!stops.get(stopData.id)) {
            stopIdsNeeded.add(stopData.id);
        }
    });

    return layerEntry;
}


function shapeLayerEntriesByRouteIdsPromise(routeIds) {
    return fetchShapesByRouteIds(routeIds);
}



///////////////////////////////////
// Trip
///////////////////////////////////

function fetchTrips(tripIds) {
    var path = 'https://api-v3.mbta.com/trips?filter%5Bid%5D=';
    if (isIterable(tripIds)) {
        var separator = '';
        for (let stopId of tripIds) {
            path += separator + stopId;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += tripIds;
    }
    
    //console.log('Fetching Trip Ids: ' + tripIds);
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processTripsResult(myJson));
}


function processTripsResult(json) {
    var data = json.data;
    var routeIds = new Set();
    var result;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processTripData(data[i]));
            routeIds.add(layerEntries[i].routeId);
        }
        
        result = layerEntries;
    }
    else {
        result = processTripData(data);
        routeIds.add(result.routeId);
    }
    
    return result;
}


function processTripData(data) {
    var tripId = data.id;
    
    var layerEntry = trips.get(tripId);
    if (!layerEntry) {
        layerEntry = new TripLayerEntry(tripId, data);
        trips.set(tripId, layerEntry);
    }
    return layerEntry;
}


function tripLayerEntriesPromise(tripId) {
    var promise;
    
    if (isIterable(tripId)) {
        var idsNeeded = [];
        var existingEntries = [];
        tripId.forEach((id) => {
            var entry = trips.get(id);
            if (entry) {
                existingEntries.push(entry);
            }
            else {
                idsNeeded.push(id);
            }
        });
        
        if (idsNeeded.length > 0) {
            var promises = [];
            var idsThisPass = [];
            for (let i = idsNeeded.length; i > 0; i -= idsThisPass.length) {
                var count = Math.min(i, 50);
                idsThisPass = idsNeeded.slice(i - count, i);
                promises.push(fetchTrips(idsThisPass)
                        .then((entries) => 
                            existingEntries = existingEntries.concat(entries)));
            }
            return Promise.all(promises)
                    .then(() => existingEntries);
        }
        else {
            return Promise.resolve(existingEntries);
        }
    }

    var tripEntry = trips.get(tripId);
    if (tripEntry) {
        return Promise.resolve(tripEntry);
    }
    return fetchTrips(tripId);
}


///////////////////////////////////
// Vehicles
///////////////////////////////////

function fetchVehicles(vehicleIds) {
    var path = 'https://api-v3.mbta.com/vehicles?filter%5Bid%5D=';
    if (isIterable(vehicleIds)) {
        var separator = '';
        for (let id of vehicleIds) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += vehicleIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processVehiclesResult(myJson));
}


function fetchRouteVehicles(routeIds) {
    var path = 'https://api-v3.mbta.com/vehicles?filter%5Broute%5D=';
    if (isIterable(routeIds)) {
        var separator = '';
        for (let id of routeIds) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += routeIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processVehiclesResult(myJson));
}

function createVehicleMarkerFromRouteLayerEntry(routeLayerEntry) {
    if (!routeLayerEntry) {
        return;
    }
    
    switch (routeLayerEntry.routeType) {
        case ROUTE_LIGHT_RAIL :
            return new LightRailMarker(routeLayerEntry);
            
        case ROUTE_HEAVY_RAIL :
            return new HeavyRailMarker(routeLayerEntry);
            
        case ROUTE_COMMUTER_RAIL :
            return new CommuterRailMarker(routeLayerEntry);
            
        case ROUTE_BUS :
            return new BusMarker(routeLayerEntry);
            
        case ROUTE_FERRY :
            return new FerryMarker(routeLayerEntry);
    }
}

// This will also be used for updating vehicle locations, so the entry may already exist.
function processVehicleData(data) {
    var id = data.id;
    var layerEntry = vehicles.get(id);
    if (!layerEntry) {
        var marker;
        var routeLayerEntry = routes.get(data.relationships.route.data.id);
        var marker = createVehicleMarkerFromRouteLayerEntry(routeLayerEntry);
        
        layerEntry = new VehicleLayerEntry(id, data, marker);
        vehicles.set(id, layerEntry);
            
        // Want to load the predictions for the stop when the tooltip comes up.
        var mapLayer = layerEntry.mapLayer;
        if (mapLayer) {
            mapLayer.bindTooltip(layerEntry.getVehicleMsgFromPredictions());

            mapLayer.on('tooltipopen', (e) => {
                mapLayer.setTooltipContent(layerEntry.getVehicleMsgFromPredictions());
                
                if (layerEntry.predictions) {
                    var msg = layerEntry.getVehicleMsgFromPredictions(layerEntry.predictions);
                    mapLayer.setTooltipContent(msg);
                }
                else {
                    fetchPredictionByTripId(layerEntry.tripId)
                            .then((predictionEntries) => {
                                var msg = layerEntry.getVehicleMsgFromPredictions(predictionEntries);
                                mapLayer.setTooltipContent(msg);
                            });            
                }
                
            });
        }

    }
    
    
    if (tLayers.isEstimateVehicleLocations) {
        if (layerEntry.predictions) {
            var currentMSecs = new Date(data.attributes.updated_at).valueOf();
            var predictionMSecs = new Date(layerEntry.predictions[0].time).valueOf();
            if (currentMSecs >= (predictionMSecs - 10000)) {
                layerEntry.predictions = undefined;
            }
        }
        vehiclePredictionsToFetch.add(layerEntry);
    }
    else {
        layerEntry.predictions = undefined;
    }
    layerEntry.updateJSONData(data);
    
    return layerEntry;
}


function processVehiclesResult(json) {
    var result;
    var data = json.data;
    var tripIds = [];
    var logMsg = ' ';
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processVehicleData(data[i]));
            tripIds.push(layerEntries[i].tripId);
            logMsg += layerEntries[i].id + '[' + layerEntries[i].latitude + ',' + layerEntries[i].longitude + '] ';
        }
        
        result = layerEntries;
    }
    else {
        var layerEntry = processVehicleData(data);
        tripIds.push(layerEntry.tripId);
        
        logMsg = layerEntry.id + '[' + layerEntry.latitude + ',' + layerEntry.longitude + ']';
        
        result = layerEntry;
    }
    
    //console.log('Processed Vehicle Ids: ' + logMsg);
    
    return tripLayerEntriesPromise(tripIds)
            .then(() => result );
}


function vehicleLayerEntryPromise(routeIds) {
    return fetchRouteVehicles(routeIds);
}



///////////////////////////////////
// Route Layer Entries
///////////////////////////////////

function fetchRouteLayerEntries(routeIds) {
    var path = 'https://api-v3.mbta.com/routes?filter%5Bid%5D=';
    if (isIterable(routeIds)) {
        var separator = '';
        for (let id of routeIds) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else {
        // Presume it's a single value
        path += routeIds;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processRoutesResultForLayer(myJson));
}

function processRouteDataForLayer(data) {
    var id = data.id;
    var layerEntry = routes.get(id);
    if (!layerEntry) {
        layerEntry = new RouteLayerEntry(id, data, null);
        routes.set(id, layerEntry);
    }
    
    return layerEntry;
}

function processRoutesResultForLayer(json) {
    var data = json.data;
    if (Array.isArray(data)) {
        var layerEntries = [];
        for (let i = 0; i < data.length; ++i) {
            layerEntries.push(processRouteDataForLayer(data[i]));
        }
        
        return layerEntries;
    }
    else {
        return processRouteDataForLayer(data);
    }
}

// This is the main updating.
// This returns a promise whose argument is an array of RouteLayerEntry objects for the route ids.
function routeLayerEntryPromise(routeIds) {
    if (!isIterable(routeIds)) {
        routeIds = [ routeIds ];
    }
    
    var routeIdsNeeded = [];
    var routeEntries = [];
    routeIds.forEach((routeId) => {
        var entry = routes.get(routeId);
        if (entry) {
            routeEntries.push(entry);
        }
        else {
            routeIdsNeeded.push(routeId);
        }
    });

    var promise;
    if (routeIdsNeeded.length > 0) {
        var routePromises = [];
        // Break this down into blocks of route ids. Too many and the message is too long,
        // too few and we get a too many requests error.
        var routesPerFetchCount = 5;
        var count = routeIdsNeeded.length;
        for (let i = 0; i < count; ) {
            var remainingCount = count;
            var toFetchCount = Math.min(remainingCount, routesPerFetchCount);
            promise = fetchRouteLayerEntries(routeIdsNeeded.slice(i, i + toFetchCount))
                    .then((entries) => routeEntries = routeEntries.concat(entries)
            );
            routePromises.push(promise);
            i += toFetchCount;
        }
        promise = Promise.all(routePromises)
                .then(() => fetchShapesByRouteIds(routeIdsNeeded))
                .then(() => routeEntries);
    }
    else {
        promise = Promise.resolve(routeEntries);
    }

    return promise
            .then((entries) => {
                return vehicleLayerEntryPromise(routeIds).then(() => entries);
            });
}



function fetchRouteIdsAndNames(types) {
    var path = 'https://api-v3.mbta.com/routes';
    if (isIterable(types)) {
        path += '?filter%5Btype%5D=';
        var separator = '';
        for (let id of types) {
            path += separator + id;
            separator = '%2C';
        }
    }
    else if (types) {
        // Presume it's a single value
        path += '?filter%5Btype%5D=';
        path += types;
    }
    
    return fetchMBTA(path)
            .then((response) => response.json())
            .then((myJson) => processRoutesResultForIdsAndNames(myJson));
}

function processRoutesResultForIdsAndNames(json) {
    var idsAndNames = [];
    var data = json.data;
    var layerEntries = [];
    for (let i = 0; i < data.length; ++i) {
        idsAndNames.push({
            id: data[i].id,
            shortName: data[i].attributes.short_name,
            longName: data[i].attributes.long_name,
            type: data[i].attributes.type
        });
    }

    return idsAndNames;
}


function processTripIdsToFetch() {
    if (!vehiclePredictionsToFetch.size) {
        return;
    }
    
    var tripIdsPerFetch = 10;

    var vehicleEntryBatches = [];
    var thisBatch = null;
    vehiclePredictionsToFetch.forEach((layerEntry) => {
        if (!thisBatch) {
            thisBatch = [];
            vehicleEntryBatches.push(thisBatch);
        }

        thisBatch.push(layerEntry);

        if (thisBatch.length > tripIdsPerFetch) {
            thisBatch = null;
        }
    });
    
    vehicleEntryBatches.forEach((batch) => {
        let tripIds = [];
        let tripIdIndexMap = new Map();
        batch.forEach((layerEntry) => {
            tripIdIndexMap.set(layerEntry.tripId, tripIds.length);
            tripIds.push(layerEntry.tripId);
        });
        
        fetchPredictionByTripId(tripIds)
                .then((predictionEntries) => {
                    let predictionsForVehicles = [];
                    let lastIndex = 0;
                    predictionEntries.forEach((predictionEntry) => {
                        if (batch[lastIndex].tripId !== predictionEntry.tripId) {
                            lastIndex = tripIdIndexMap.get(predictionEntry.tripId);
                            if (lastIndex === undefined) {
                                return;
                            }
                        }
                        if (!predictionsForVehicles[lastIndex]) {
                            predictionsForVehicles[lastIndex] = [];
                        }
                        predictionsForVehicles[lastIndex].push(predictionEntry);
                    });
                    
                    for (let i = batch.length - 1; i >= 0; --i) {
                        let layerEntry = batch[i];
                        if (predictionsForVehicles[i]) {
                            predictionsForVehicles[i].sort(comparePredictionEntryStopSequence);
                        }
                        layerEntry.predictions = predictionsForVehicles[i];
                        layerEntry.updateJSONData(layerEntry.jsonData);
                    }
                });
    });
    
    
    vehiclePredictionsToFetch.clear();
    
/*            fetchPredictionByTripId(layerEntry.tripId)
                .then((predictionEntries) => {
                    layerEntry.predictions = predictionEntries;
                    layerEntry.updateJSONData(layerEntry.jsonData);
                });            
*/
}

    // OK to run this frequently, since it only does stuff when there's something queue'd up.
    setInterval(processTripIdsToFetch, 2000);

    tLayers.routeLayerEntryPromise = routeLayerEntryPromise;
    tLayers.fetchRouteIdsAndNames = fetchRouteIdsAndNames;
    tLayers.getSettingsAsJSON = getSettingsAsJSON;
    tLayers.updateSettingsFromJSON = updateSettingsFromJSON;
    return tLayers;
};