var x, y, i, j;

////// Game constants / states /////

MAX_ANIMALS = 30;
uiBrushSize = 6;

seed = Math.random();
C = document.createElement("canvas");

started = 0;
gameover = 0;
score = topScore = +(localStorage.ibex || 0);
tiles = new Image();
tiles.src = "t.png";

// in milliseconds
updateRate = 35;
refreshWorldRate = 300;

initialAnimals = 8;

colors = [
  0.11, 0.16, 0.23, // 0: air
  0.74, 0.66, 0.51, // 1: earth
  0.84, 0.17, 0.08, // 2: fire
  0.40, 0.75, 0.90, // 3: water

  // spawners
  0.60, 0.00, 0.00, // 4: volcano (fire spawner)
  0.30, 0.60, 0.70, // 5: source (water spawner)

  0.15, 0.20, 0.27,  // 6: wind left
  0.07, 0.12, 0.19,  // 7: wind right
  0.20, 0.60, 0.20   // 8: grass (forest)
];

camAutoSpeed = 4;
camAutoThreshold = 160;

tick = 0;
startTick = 0;
worldRefreshTick = 0;
worldWindow = 90; // The size of the world chunk window in X
worldSize = [ 3 * worldWindow, 256 ];
rescueSpawnMinY = 10;
rescueSpawnMaxY = 150;
worldPixelRawBuf = new Uint8Array(worldSize[0] * worldSize[1] * 4);
worldPixelBuf = new Uint8Array(worldSize[0] * worldSize[1]);
worldStartX = 0;

// resolution
// zoom
camera = [ 0, 0 ]; // Camera is in resolution coordinate (not worldSize)
cameraV = [0, 0 ];
mouse = [ 0, 0 ];

draw = 0;
// drawPosition
drawObject = 1;
drawRadius = uiBrushSize;
buttons = [0,0,0,0];

animals = [];
alive = toRescue = 0;

//////// Game events /////

window.addEventListener("resize", onResize);

function clamp (a, b, x) {
  return Math.max(a, Math.min(x, b));
}

function posToWorld (p) {
  return [ (camera[0] + p[0]) / zoom, (camera[1] + p[1]) / zoom ];
}

function setCam (c) {
  camera = [
    clamp(-resolution[0]/2, resolution[0]/2+ zoom * worldSize[0] - resolution[0], c[0]),
    clamp(-0.3 * resolution[1], 0.7 * resolution[1] + zoom * worldSize[1] - resolution[1], c[1])
  ];
}

function posE (e) {
  return [ e.clientX, resolution[1] - e.clientY ];
}

function distance (a, b) {
  var dx = a[0] - b[0], dy = a[1] - b[1];
  return Math.sqrt(dx*dx+dy*dy);
}

var dragStart, dragCam, camStart, dragElement, selectElStart;

function resetMouse () {
  camStart = dragStart = dragCam = 0;
  C.style.cursor = started ? "default" : "pointer";
}
resetMouse();

function uiSelectElement (p) {
  var height = 2 * 4 * zoom;
  var originY = resolution[1] / 3 - 14 * zoom - height / 2;
  if (originY < p[1] && p[1] < originY + height) {
    var width = 8 * zoom + 8;
    var x = (resolution[0] - 4 * width) / 2;
    var i = Math.floor((p[0]-x)/width);
    if (0 <= i && i < 4) {
      return i;
    }
  }
  return -1;
}

function isCursor (p) {
  return distance(cursorCenterPos(), p) < zoom * uiBrushSize;
}
function cursorCenterPos () {
  return [ resolution[0] / 2, resolution[1] / 3 ];
}

C.addEventListener("mouseleave", resetMouse);

C.addEventListener("mousedown", function (e) {
  e.preventDefault();
  if (!started || gameover) return;
  dragStart = posE(e);
  dragCam = !isCursor(dragStart);
  selectElStart = uiSelectElement(dragStart);
  camStart =[].concat(camera);
});

C.addEventListener("mouseup", function (e) {
  if (!started) start();
  if (!started || gameover) return;
  var p = posE(e);
  if (selectElStart != -1) {
    var selectElP = uiSelectElement(p);
    if (selectElStart == selectElP) {
      drawObject = selectElStart;
    }
  }
  resetMouse();
});

C.addEventListener("mousemove", function (e) {
  if (!started || gameover) return;
  var p = posE(e);
  mouse = p;
  var selectElP = uiSelectElement(p);

  C.style.cursor = dragStart ? (!dragCam ? "none" : "move") : (isCursor(p)||selectElP!=-1 ? "pointer" : "default");

  if (dragStart) {
    var dx = p[0] - dragStart[0];
    var dy = p[1] - dragStart[1];

    if (dragCam) {
      setCam([ camStart[0] - dx, camStart[1] - dy ]);
    }
    else {
      setCam([ camStart[0] + dx, camStart[1] + dy ]);
    }

  }
});



// Keyboard

var keysDown = new Uint8Array(200); // we do that because nicely initialized to 0

function keyDraw () {
  if (!started || gameover) return;
  if (keysDown[32]) {
    draw = 1;
  }
  if (keysDown[87]||keysDown[90]) {
    drawObject = 0;
  }
  else if (keysDown[88]) {
    drawObject = 1;
  }
  else if (keysDown[67]) {
    drawObject = 2;
  }
  else if (keysDown[86]) {
    drawObject = 3;
  }
  if (!draw && dragStart && !dragCam) {
    draw = 1;
    //drawPosition = posToWorld(uiElementCenterPos(drawObject));
  }
  /*
  if (draw) {
    drawPosition = posToWorld(uiElementCenterPos(drawObject));
  }
  */
  drawPosition = posToWorld(cursorCenterPos());
}

//
//       38
//    37 40 39
var currentCamKeys, lastCamKeysChange = Date.now();
function handleKeys () {
  var s = 6,
      dx = keysDown[39]-keysDown[37],
      dy = keysDown[38]-keysDown[40];
  var camKeys = dx+"_"+dy;
  if (camKeys != currentCamKeys) {
    currentCamKeys = camKeys;
    lastCamKeysChange = Date.now();
  }
  cameraV = [ s*dx, s*dy ];
}

document.addEventListener("keyup", function (e) {
  var w = e.which;
  keysDown[w] = 0;
  if (37 <= w && w <= 40 || w==87 || w==90 || w==88 || w==67 || w==86) {
    handleKeys();
  }
});

document.addEventListener("keydown", function (e) {
  var w = e.which;
  keysDown[w] = 1;
  if (37 <= w && w <= 40 || w==87 || w==90 || w==88 || w==67 || w==86) {
    e.preventDefault();
    handleKeys();
  }
});

///////// UTILS /////////////////////

function ground (i) {
  return i == 1 || i == 4 || i == 5;
}

/////////// ANIMAL ///////////////////

var sightw = 32,
    sighth = 18,
    sighthalfw = sightw / 2,
    sighthalfh = sighth / 2;

function Animal (initialPosition, dt) {
  var self = this;
  // p: position, t: targetted position
  self.p = initialPosition;
  self.t = [];
  // v: velocity
  self.v = [0, 0];
  // dt: next decision time
  self.dt = dt;

  // this.d <- the animal status.
  //      *  -1  animal to rescue.
  //      *   0  alive. 
  //      * > 0  died, with a reason code
  // this.T <- death time
  // this.sl <- stats left
  // this.sr <- stats right
  // this.s <- size
  // this.h <- hash for caching the animalSyncSight
}

function animalPixel (animal, x, y) {
  var sx = Math.floor(animal.p[0] - sighthalfw) + x - worldStartX;
  if (sx < 0 || sx >= worldSize[0]) return 1;
  var sy = Math.floor(animal.p[1] - sighthalfh) + y;
  if (sy < 0 || sy >= worldSize[1]) return 1;
  return worldPixelBuf[sx + sy * worldSize[0]];
}

// Animal functions
// I'm not doing prototype to save bytes (better limit the usage of fields which are hard to minimize)

function animalSyncSight (animal) {
  var h = worldRefreshTick+'_'+Math.floor(animal.p[0])+'_'+Math.floor(animal.p[1]);
  if (animal.h == h) return;
  animal.h = h;

  /**
   * Stats:
   * sl & sr are 2 arrays of left & right exploration stats.
   *
   * Each array contains an object with:
   * f (floor): the position of a solid block (under the animal)
   * c (ceil): the position of the ceil on top of this solid block
   * h (height): ceil - floor - 1
   * s (slope): the slope in pixels – how much pixel to reach next pixels? (pixels because may be smoothed)
   * e (elements): count of elements in the [floor,ceil] range. (array with same indexes)
   * v (elements viewable)
   * a (accessible): 1 if next pixel can be accessed. 0 otherwise
   *
   * The array also contains fields:
   * a (accessible count): number of pixels that can be accessed
   */
  function stats (dir) {
    var a, x, y, i, ret = [];

    var floors = [];
    for (x=sighthalfw, y=sighthalfh; 0<=x && x<sightw; x += dir) {
      if (y == sighth) y--;
      if (y == -1) y++;
      while (y < sighth && ground(animalPixel(animal, x, y))) y++;
      if (y < sighth) while (y >= 0 && !ground(animalPixel(animal, x, y))) y--;
      floors.push(y);
    }

    var countA = 0;
    for (i=0, x=sighthalfw, a=1; 0<=x && x<sightw; x += dir, ++i) {
      var f = floors[i],
          c,
          h,
          s,
          e = [0,0,0,0,0,0,0,0,0],
          ve = [0,0,0,0,0,0,0,0,0];
      var pixels = new Uint8Array(sighth);
      for (y=0; y<sighth; ++y) pixels[y] = animalPixel(animal, x, y);

      // Compute slope
      s = ((i<sighthalfw-1 ? floors[i+1] : f) + (i<sighthalfw-2 ? floors[i+2] : f))/2 - f;
      // Compute ceil
      for (c = f+1; c<sighth && !ground(pixels[c]); c++);
      // Compute height
      h = c - f - 1;
      // Stop if conditions are reachable for the animal
      if (h < 4 /* min height */ || s < -3 || 3 < s /* max fall / climb */) {
        a = 0;
      }
      // Compute elements
      for (y=f; y<=c; ++y) e[pixels[y]] ++;
      for (y=0; y<sighth; ++y) ve[pixels[y]] ++;

      ret.push({f:f,c:c,h:h,s:s,e:e,v:ve,a:a});
      if (a) countA ++;
    }
    ret.a = countA;
    return ret;
  }
  animal.sl = stats(-1);
  animal.sr = stats(1);
}

/**
 * reasons
 * 0: falls in a cliff
 * 1: stuck in earth
 * 2: burned by fire
 */
function animalDie (animal, reason) {
  animal.d = 1+reason;
  animal.T = Date.now();
  console.log(["falls in a cliff","stuck in earth","burned by fire"][reason], animal);
}

function animalUpdate (animal, center) {
  if (animal.d>0) return;
  animalSyncSight(animal);

  var x, y, i,
      s = animal.sl[0],
      f = s.f,
      groundDiff = sighthalfh - (f + 1);

  // fire burns animal
  if (s.e[2]) {
    for (y=0; y<=5; ++y) {
      if (animalPixel(animal, sighthalfw, sighthalfh + y) == 2) {
        animalDie(animal, 2);
        break;
      }
    }
  }

  // animal reaches the ground violently
  if (!groundDiff && animal.v[1] < -2) {
    return animalDie(animal, 0);
  }

  if (groundDiff) {
    // ground buries animal
    if (f > sighthalfh && groundDiff < -4) return animalDie(animal, 1);

    if (groundDiff > 0) {
      // Gravity
      animal.v[1] -= 0.12;
    }
    else {
      // move up
      animal.p[1] -= groundDiff;
      animal.v = [0,0];
    }
  }
  else {
    animal.v[1] = 0;
    animal.p[1] = Math.floor(animal.p[1]);
  }

  // Edge case where the animal would fall forever
  if (animal.p[1] < 0) return animalDie(animal, 0);

  animalSyncSight(animal);


  //////// Animal decision (each 500ms - 1s) ///////

  var now = Date.now();
  if (!animal.d && (animal.t.length==0 || now > animal.dt)) {
    if (now > animal.dt) {
      animal.t = []; // Forget the previous decision
    }

    // Next re-decision time
    animal.dt = now + 500 + 500 * Math.random();

    // Is there water nearby?
    var water = 0, waterDistance;
    var maxWaterSee = sighthalfw;
    for (i=0; i<maxWaterSee; ++i) {
      if (animal.sl[i] && animal.sl[i].e[3]) {
        water = -1;
        waterDistance = i;
        break;
      }
      if (animal.sr[i] && animal.sr[i].e[3]) {
        water = 1;
        waterDistance = i;
        break;
      }
    }

    // Is there fire nearby?
    var fire = 0, fireDistance;
    var maxFireSee = sighthalfw;
    for (i=0; i<maxFireSee; ++i) {
      if (animal.sl[i] && animal.sl[i].v[2]) {
        fire = -1;
        fireDistance = i;
        break;
      }
      if (animal.sr[i] && animal.sr[i].v[2]) {
        fire = 1;
        fireDistance = i;
        break;
      }
    }

    // Distance with center of all animals
    var deltaCenter = [ center[0] - animal.p[0], center[1] - animal.p[1] ];

    // Cliff at right & following plateform?
    var cliffRight = 0, cliffRightFollowedBySafePlatform;
    var cliffRightLastPlatform, cliffRightAfterPlatform;
    for (i=0; i<sighthalfw; ++i) {
      var r = animal.sr[i];
      if (!r.a) {
        if (r.s < -3) { // select cliff only
          cliffRight = 1;
          cliffRightLastPlatform = [ i, r.f ];
        }
        break;
      }
    }
    if (cliffRight) {
      for (i=cliffRightLastPlatform[0]+2; i<sighthalfw; ++i) {
        var r = animal.sr[i];
        var dy = r.f - cliffRightLastPlatform[1];
        if (Math.abs(dy) <= 5) { // valid jump conditions
          if (r.h >= 4) { // safety conditions
            cliffRightFollowedBySafePlatform = 1;
            cliffRightAfterPlatform = [ i, r.f ];
          }
          break;
        }
      }
    }

    x = Math.floor(animal.p[0]);
    y = Math.floor(animal.p[1]);

    var decision = [];

    // decision format:
    // noop: ['n', time, _ ]
    // walk: ['w', xVel, xEnd]
    // run: ['r', xVel, xEnd]
    // jump: ['j', xVel, yVel]

    // TODO from new events, compute if or not the animal should reconsider previous decisions

    if ((fire < 0 || !fire && Math.random() < 0.5) && cliffRight && cliffRightFollowedBySafePlatform) {
      var vx = 0.1 + 0.09 * (cliffRightAfterPlatform[0] - cliffRightLastPlatform[0]), vy = 1;

      decision = [
        "r", 0.7, x + cliffRightLastPlatform[0] - 1,
        "j", vx, vy,
        "n", 500, 0
      ];

    }

    else if (fire) {
      decision = [
        "r", -1 * fire, x + (fire<0 ? 30 : -30) + 10 * (0.5-Math.random()),
        "w", -0.5 * fire, x + (fire<0 ? 50 : -50) + 10 * (0.5-Math.random())
      ];
    }

    else {
      var r = Math.random();
      var d =
        Math.random() < 0.1 ? animal.sr.a - animal.sl.a :
        water && waterDistance < 5 && Math.random()<0.5 ? water :
        Math.random()<0.2 && Math.abs(deltaCenter[0])>80 ? deltaCenter[0] :
        1
        ;
      if (r < 0.8 || water && waterDistance < 5) {
        decision = [
          "w", (d>=0 ? 1 : -1) * 0.3, x + (d>=0 ? animal.sr.a-1 : -animal.sl.a+1)
        ];
      }
      else {
        decision = ["n", 500, 0];
      }
    }

    animal.t = animal.t.concat(decision); // append the decision
  }

  //// Animal apply move & check collision

  if (groundDiff == 0) {
    var i, c = 1;
    for (i = 0; i<animal.t.length && c; i += 3) {
      c = 0;
      var action = animal.t[i];
      var a = animal.t[i+1];
      var b = animal.t[i+2];
      if (action == 'n') {
        if (!b) b = animal.t[i+2] = Date.now() + a;
        if (Date.now() > b) {
          c = 1;
        }
      }
      if (action == 'w' || action == 'r') {
        var dirS = a < 0 ? animal.sl : animal.sr;
        if (!dirS[0].a || a > 0 && b <= animal.p[0] || a < 0 && b >= animal.p[0]) {
          animal.v[0] = 0;
          c = 1;
        }
        else {
          animal.v[0] = a;
        }
      }
      if (action == 'j') {
        c = 1;
        animal.p[1] ++;
        animal.v = [a, b];
      }
    }
    if (!c) i -= 3;
    if (i>0) animal.t.splice(0, i);
  }

  animalSyncSight(animal);

  // apply the real velocity from the environnement
  var v = [].concat(animal.v);
  var els = animal.sl[0].e;
  if (v[0]) {
    var add = [0,0];
    var friction = 1;
    var wind = els[7] - els[6];
    if (wind > 3) add[0] += 0.1;
    if (wind < 3) add[0] -= 0.1;
    if (groundDiff==0) {
      friction *= 1 - 0.2 * step(0, 3, els[8]);
      friction *= 1 - 0.5 * step(0, 3, els[3]);
    }
    v[0] += add[0];
    v[1] += add[1];
    v[0] *= friction;
    v[1] *= friction;
  }

  // TODO implement 2D collision detection (avoid animal being stuck)
  var p = [ animal.p[0] + v[0], animal.p[1] + v[1] ];
  if (groundDiff == 0) {
    var dx = Math.floor(p[0]) - Math.floor(animal.p[0]);
    if (dx) {
      var s = dx > 0 ? animal.sr : animal.sl;
      dx = Math.abs(dx);
      if (s[dx] && s[dx].a) {
        animal.p = p;
      }
    }
    else {
      animal.p = p;
    }
  }
  else {
    animal.p = p;
  }

  /*
  if (isNaN(animal.p[0]+animal.p[1])) {
    console.log("Animal got NaN positions!!!", animal);
  }
  */
}

//////////////////////////////////////

var gl = C.getContext("webgl") || C.getContext("experimental-webgl");

var shader, shaderSrc, shaderType, program;

/// Rendering program
program = gl.createProgram();

shaderSrc = VERTEX_RENDER; shaderType = gl.VERTEX_SHADER;
shader = gl.createShader(shaderType);
gl.shaderSource(shader, shaderSrc);
gl.compileShader(shader);
validate(shader, shaderSrc);
gl.attachShader(program, shader);

shaderSrc = FRAGMENT_RENDER; shaderType = gl.FRAGMENT_SHADER;
shader = gl.createShader(shaderType);
gl.shaderSource(shader, shaderSrc);
gl.compileShader(shader);
validate(shader, shaderSrc);
gl.attachShader(program, shader);

gl.linkProgram(program);
validateProg(program);
gl.useProgram(program);

var buffer = gl.createBuffer();
var renderPositionL = gl.getAttribLocation(program, "position");
gl.enableVertexAttribArray(renderPositionL);
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.vertexAttribPointer(renderPositionL, 2, gl.FLOAT, false, 0, 0);

onResize();

var renderTimeL = gl.getUniformLocation(program, "time");
var renderAliveL = gl.getUniformLocation(program, "alive");
var renderToRescueL = gl.getUniformLocation(program, "toRescue");
var renderZoomL = gl.getUniformLocation(program, "zoom");
var renderStartedL = gl.getUniformLocation(program, "started");
var renderGameOverL = gl.getUniformLocation(program, "gameover");
var renderScoreL = gl.getUniformLocation(program, "score");
var renderStateL = gl.getUniformLocation(program, "state");
var renderWorldSizeL = gl.getUniformLocation(program, "worldSize");
var renderAnimalsL = gl.getUniformLocation(program, "animals");
var renderAnimalsLengthL = gl.getUniformLocation(program, "animalsLength");
var renderAnimalsTilesL = gl.getUniformLocation(program, "tiles");
var renderColorsL = gl.getUniformLocation(program, "colors");
var renderDrawObjectL = gl.getUniformLocation(program, "drawObject");
var renderDrawRadiusL = gl.getUniformLocation(program, "drawRadius");

var cameraL = gl.getUniformLocation(program, "camera");
var mouseL = gl.getUniformLocation(program, "mouse");
var drawingL = gl.getUniformLocation(program, "drawing");
var resolutionL = gl.getUniformLocation(program, "resolution");

var texture = gl.createTexture();
tiles.onload = function () {
  gl.useProgram(renderProgram);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tiles);
  gl.uniform1i(renderAnimalsTilesL, 1);
  gl.activeTexture(gl.TEXTURE0);
}

gl.uniform1i(renderStateL, 0);
gl.uniform3fv(renderColorsL, colors);

function onResize () {
  resolution = [ window.innerWidth, window.innerHeight ];
  C.width = resolution[0];
  C.height = resolution[1];
  zoom = Math.round(2 + Math.sqrt(C.width * C.height) / 250);
  gl.viewport(0, 0, C.width, C.height);
  var x1 = 0, y1 = 0, x2 = resolution[0], y2 = resolution[1];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2]), gl.STATIC_DRAW);
  gl.uniform2fv(resolutionL, resolution);
}

var renderProgram = program;

/// Logic program
program = gl.createProgram();

shaderSrc = VERTEX_LOGIC; shaderType = gl.VERTEX_SHADER;
shader = gl.createShader(shaderType);
gl.shaderSource(shader, shaderSrc);
gl.compileShader(shader);
validate(shader, shaderSrc);
gl.attachShader(program, shader);

shaderSrc = FRAGMENT_LOGIC; shaderType = gl.FRAGMENT_SHADER;
shader = gl.createShader(shaderType);
gl.shaderSource(shader, shaderSrc);
gl.compileShader(shader);
validate(shader, shaderSrc);
gl.attachShader(program, shader);

gl.linkProgram(program);
validateProg(program);

var logicSeedL = gl.getUniformLocation(program, "seed");
var logicRunningL = gl.getUniformLocation(program, "running");
var logicTickL = gl.getUniformLocation(program, "tick");
var logicWorldStartL = gl.getUniformLocation(program, "startX");
var logicStartTickL = gl.getUniformLocation(program, "tickStart");
var logicStateL = gl.getUniformLocation(program, "state");
var logicSizeL = gl.getUniformLocation(program, "size");
var logicDrawL = gl.getUniformLocation(program, "draw");
var logicDrawPositionL = gl.getUniformLocation(program, "drawPosition");
var logicDrawObjectL = gl.getUniformLocation(program, "drawObject");
var logicDrawRadiusL = gl.getUniformLocation(program, "drawRadius");
var logicPositionL = gl.getAttribLocation(program, "position");

gl.enableVertexAttribArray(logicPositionL);

var logicTexture = gl.createTexture();
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, logicTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

var logicFramebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, logicFramebuffer);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, logicTexture, 0);

gl.useProgram(program);
gl.uniform1f(logicSeedL, seed);
gl.uniform1i(logicStateL, 0);

var logicProgram = program;


function step (a, b, x) {
  return Math.max(0, Math.min((x-a) / (b-a), 1));
}

function affectColor (buf, i, c) {
  buf[i] = Math.floor(256 * c / 9);
  buf[i+3] = 1;
}

function generate (startX) {
  var randTerrainAmount = !worldStartX ? 0 : 0.08 * Math.random() * Math.random();
  var randTerrainDown = !worldStartX ? 0 : 100 * Math.random() * Math.random();

  // This could be implemented in a 3rd shader for performance.

  var w = worldSize[0], h = worldSize[1];

  function get (b, x, y) {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      return b[x + y * w];
    }
    return y > 50 ? 1 : 0;
  }

  function set (b, x, y, e) {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      b[x + y * w] = e;
    }
  }

  var K = 26;

  var x, y, i, k, e;
  for (x = startX; x < worldSize[0]; ++x) {
    for (y = 0; y < worldSize[1]; ++y) {
      if (startX && x <= startX) {
        // This try to make the world more seamless, not perfect yet.
        e = ground(get(worldPixelBuf, startX-1, y)) ? 1 : 0;
      }
      else {
        e = +(Math.random() > -0.2 * step(100, 0, x + worldStartX) + 0.09 + randTerrainAmount + 0.3 * (step(0, 25, y) + step(worldSize[1]-50-randTerrainDown, worldSize[1] - 2 - 0.2 * randTerrainDown, y)));
      }
      set(worldPixelBuf, x, y, e);
    }
  }

  var swp = new Uint8Array(worldPixelBuf);
  var cur = worldPixelBuf;

  for (k = 0; k < K; ++k) {

    for (x = startX; x < worldSize[0]; ++x) {
      for (y = 0; y < worldSize[1]; ++y) {
        var me = get(cur, x, y);
        var sum =
          0.1 * me +
          (0.9 + 0.1 * Math.random()) * get(cur, x-1, y-1) +
          (0.9 + 0.1 * Math.random()) * get(cur, x, y-1) +
          (0.9 + 0.1 * Math.random()) * get(cur, x+1, y-1) +
          (1.4 + 0.2 * Math.random()) * get(cur, x-1, y) +
          (1.1 + 0.2 * Math.random()) * get(cur, x+1, y) +
          (1.6 - 0.1 * Math.random()) * get(cur, x-1, y+1) +
          (1.2 - 0.2 * Math.random()) * get(cur, x, y+1) +
          (1.0 - 0.1 * Math.random()) * get(cur, x+1, y+1);

        var e = +(sum <= 6 + (Math.random()-0.5) * (1-k/K));
        set(swp, x, y, e);
      }
    }

    var tmp = swp;
    swp = cur;
    cur = tmp;
  }

  if (swp === cur) worldPixelBuf = swp;

  // Locate good spots to spawn some animals to rescue

  var nbSpots = Math.min(
    Math.random() * 3 + 1 - 4 * Math.random() * Math.random(),
    MAX_ANIMALS-animals.length);
  var spots = [];

  // Dichotomic search starting from the center
  function locateSpot (xMin, xMax, maxIteration) {
    //console.log(arguments, spots);
    if (!maxIteration || nbSpots <= spots.length) return;
    var xCenter = Math.floor(xMin+(xMax-xMin)/2);
    var airOnTop = 0;
    var found = [];
    for (
      y = Math.floor(rescueSpawnMaxY - Math.random() * (rescueSpawnMaxY-rescueSpawnMinY)); // Not always spawn from the top
      y > rescueSpawnMinY;
      y--
    ) {
      var isEarth = get(worldPixelBuf, xCenter, y);
      if (airOnTop>6 && isEarth) {
        spots.push([ worldStartX + xCenter, y + 1 ]);
        break;
      }
      airOnTop = isEarth ? 0 : airOnTop + 1;
    }
    if (Math.random() < 0.5) {
      locateSpot(xMin, xCenter, maxIteration-1);
      locateSpot(xCenter, xMax, maxIteration-1);
    }
    else {
      locateSpot(xCenter, xMax, maxIteration-1);
      locateSpot(xMin, xCenter, maxIteration-1);
    }
  }

  if (startX) {
    locateSpot(startX+1, worldSize[0]-1, 8);
    for (var i=0; i<spots.length; ++i) {
      var animal = new Animal(spots[i], 0);
      animal.d = -1;
      animals.push(animal);
    }
  }

  for (i = 0; i < worldPixelBuf.length; ++i) {
    affectColor(worldPixelRawBuf, 4 * i, worldPixelBuf[i]);
  }

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, worldSize[0], worldSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, worldPixelRawBuf);
}

function rechunk (fromX, toX) {
  var newWorldStartX = worldStartX + fromX;
  var newWorldSize = [ toX-fromX, worldSize[1] ];
  var newWorldPixelRawBuf = new Uint8Array(newWorldSize[0] * newWorldSize[1] * 4);
  var newWorldPixelBuf = new Uint8Array(newWorldSize[0] * newWorldSize[1]);
  var genStartX = worldSize[0] - fromX;

  for (var x=0; x < newWorldSize[0] && fromX + x < worldSize[0]; ++x) {
    for (var y=0; y < newWorldSize[1]; ++y) {
      var e = worldPixelBuf[fromX + x + y * (worldSize[0])];
      var i = x + y * newWorldSize[0];
      newWorldPixelBuf[i] = e;
    }
  }

  worldStartX = newWorldStartX;
  worldSize = newWorldSize;
  worldPixelRawBuf = newWorldPixelRawBuf;
  worldPixelBuf = newWorldPixelBuf;
  generate(genStartX);

  camera[0] -= fromX * zoom;
  if (camStart) camStart[0] -= fromX * zoom;
}

function checkRechunk () {
  var alives = [];
  for (var i=0; i<animals.length; ++i) {
    if (!animals[i].d) alives.push(animals[i]);
  }
  var minX, maxX;
  if (alives.length == 0) {
    minX = worldStartX + camera[0] / zoom;
    maxX = worldStartX + (camera[0] + resolution[0]) / zoom;
  }
  else {
    var minX = animals[0].p[0], maxX = minX;
    for (var i=0; i<alives.length; ++i) {
      var animal = animals[i];
      minX = Math.min(animal.p[0], minX);
      maxX = Math.max(animal.p[0], maxX);
    }
  }
  var windowInf = Math.max(worldStartX, worldWindow * Math.floor(minX / worldWindow - 2));
  var windowSup = Math.max(worldStartX + worldSize[0], worldWindow * Math.ceil(maxX / worldWindow + 2));

  var fromX = Math.max(0, windowInf - worldStartX); // No going back
  var toX = Math.max(worldSize[0], fromX + (windowSup - windowInf)); // No going back

  if (fromX || (toX-fromX) - worldSize[0]) {
    rechunk(fromX, toX);
    return 1;
  }
}

//////////// RUN THE GAME /////////////////

generate(0);

var tops = new Uint8Array(100);

for (x=0; x<100; ++x) {
  for (var y = worldSize[1]-1; y > 0; y--) {
    if (ground(worldPixelBuf[x + y * worldSize[0]])) {
      tops[x] = y;
      break;
    }
  }
}

function init () {
  topScore = 0;
  for (i = 0; i < initialAnimals; ++i) {
    var x = Math.floor(40 + 40 * Math.random());
    var y = tops[x]+1;
    var a = new Animal([ x, y ], Date.now() + 5000 + 8000 * Math.random());
    animals.push(a);
  }
}

function gameOver () {
  localStorage.ibex = Math.max(topScore, localStorage.ibex||0);
  setTimeout(function () {
    onclick = location.reload;
  }, 2000);
}

function start () {
  started = 1;
  init();

  cameraV[1] = 3;
  var camT = Date.now();
  (function check () {
    if (Date.now() - camT > 5000 || camera[1] + resolution[1] >= worldSize[1] * zoom) {
      cameraV[1] = 0;
      startTick = tick;
    }
    else setTimeout(check, 0);
  }());
}

var startTime = Date.now();
var lastUpdate = 0;
var lastRefreshWorld = startTime + 5000;
function update () {
  var now = Date.now();
  var needRead = now - lastRefreshWorld >= refreshWorldRate;
  if (!needRead && now-lastUpdate < updateRate) return;
  lastUpdate = now;
  gl.useProgram(logicProgram);
  gl.uniform2fv(logicSizeL, worldSize);
  gl.uniform1f(logicTickL, tick);
  gl.uniform1f(logicWorldStartL, worldStartX);
  gl.uniform1f(logicStartTickL, startTick);
  gl.uniform1i(logicRunningL, started);
  gl.uniform1i(logicDrawL, draw);
  if (draw) {
    draw = 0;
    gl.uniform2iv(logicDrawPositionL, drawPosition);
    gl.uniform1f(logicDrawRadiusL, drawRadius);
    gl.uniform1i(logicDrawObjectL, drawObject);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(logicPositionL, 2, gl.FLOAT, gl.FALSE, 0, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, logicFramebuffer);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (needRead) {
    lastRefreshWorld = now;
    gl.readPixels(0, 0, worldSize[0], worldSize[1], gl.RGBA, gl.UNSIGNED_BYTE, worldPixelRawBuf);
    parseColors(worldPixelRawBuf, worldPixelBuf);
    if (checkRechunk()) {
      gl.readPixels(0, 0, worldSize[0], worldSize[1], gl.RGBA, gl.UNSIGNED_BYTE, worldPixelRawBuf);
      parseColors(worldPixelRawBuf, worldPixelBuf);
    }
    worldRefreshTick ++;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  tick ++;
}

function render () {
  requestAnimationFrame(render);
  keyDraw();
  var drawing = draw;
  update();

  // Update Animals
  var centerAnimals = [0,0];
  for (i=0; i<animals.length; i++) {
    var self = animals[i];
    if (!self.d) {
      centerAnimals[0] += self.p[0];
      centerAnimals[1] += self.p[1];
    }
    else if (self.d<0) {
      for (j=0; j<animals.length; j++) {
        var other = animals[j];
        if (!other.d && distance(self.p, other.p) < 6) {
          self.d = 0;
          break;
        }
      }
    }
  }
  centerAnimals[0] /= animals.length;
  centerAnimals[1] /= animals.length;
  alive = 0;
  toRescue = 0;
  for (var i=0; i<animals.length;) {
    var animal = animals[i];
    animalUpdate(animal, centerAnimals);
    if (!animal.d) {
      topScore = Math.max(topScore, Math.floor(animal.p[0]));
      alive ++;
    }
    else if (animal.d < 0) {
      toRescue ++;
    }
    if (animal.d<0 && animal.p[0]<worldStartX || animal.d>0 && Date.now() - animal.T > 3000) {
      animals.splice(i, 1);
    }
    else {
      ++i;
    }
  }

  score = score + 0.01*(topScore-score);

  if (started && !alive) {
    if (!gameover) {
      gameOver();
    }
    cameraV[0] = 1;
    gameover = 1;
    score = topScore;
  }

  var camVel = drawing ? 0.5 : (currentCamKeys!="0_0" && Date.now()-lastCamKeysChange > 500 ? 2 : 1);
  var dx = camVel * cameraV[0];
  var dy = camVel * cameraV[1];
  if (camStart) {
    camStart[0] += dx;
    camStart[1] += dy;
  }
  setCam([ camera[0] + dx, camera[1] + dy ]);

  var animalsData = [];
  for (var i=0; i<animals.length; ++i) {
    var animal = animals[i];
    var statBack = animal.v[0] > 0 ? animal.sl : animal.sr;
    var slope = statBack[0].f+1==sighthalfh && statBack[3].a ? statBack[0].f - statBack[3].f : 0;
    animalsData.push(
      animal.p[0] - worldStartX,
      animal.p[1],
      animal.v[0],
      animal.v[1],
      animal.d,
      (animal.T-startTime)/1000,
      slope
    );
  }

  var time = (Date.now()-startTime)/1000;
  gl.useProgram(renderProgram);
  gl.uniform2fv(resolutionL, resolution);
  gl.uniform2fv(renderWorldSizeL, worldSize);
  gl.uniform1f(renderTimeL, time);
  gl.uniform1f(renderAliveL, alive);
  gl.uniform1f(renderToRescueL, toRescue);
  gl.uniform1f(renderZoomL, zoom);
  gl.uniform2fv(cameraL, camera);
  gl.uniform2fv(mouseL, mouse);
  gl.uniform1i(drawingL, drawing);
  gl.uniform1i(renderStartedL, started);
  gl.uniform1i(renderGameOverL, gameover);
  gl.uniform1f(renderScoreL, score);
  if (animalsData.length) {
    gl.uniform1fv(renderAnimalsL, animalsData);
  }
  gl.uniform1i(renderAnimalsLengthL, animals.length);
  gl.uniform1f(renderDrawRadiusL, drawRadius);
  gl.uniform1i(renderDrawObjectL, drawObject);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(renderPositionL, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

document.body.innerHTML = '';
document.body.appendChild(C);

render();

///////////// UTILITIES ////////////////////

function parseColors (bufin, bufout) {
  // bufin: RGBA colors, bufout: element indexes
  // bufin size == 4 * bufout size
  for (var i=0; i<bufin.length; i += 4) {
    bufout[i/4] = Math.floor(0.5 + 9 * bufin[i] / 256);
  }
}

// TODO: Remove in the final release

function validate (shader, shaderSource) {
  var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!compiled) {
    var lastError = gl.getShaderInfoLog(shader);
    var split = lastError.split(":");
    var col = parseInt(split[1], 10);
    var line = parseInt(split[2], 10);
    var s = "";
    if (!isNaN(col)) {
      var spaces = ""; for (var i=0; i<col; ++i) spaces+=" ";
      s = "\n"+spaces+"^";
    }
    console.log(lastError+"\n"+shaderSource.split("\n")[line-1]+s);
    gl.deleteShader(shader);
    throw new Error(shader+" "+lastError);
  }
}
function validateProg (program) {
   var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
   if (!linked) {
     gl.deleteProgram(program);
     throw new Error(program+" "+gl.getProgramInfoLog(program));
   }
}

