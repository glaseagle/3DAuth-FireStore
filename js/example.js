var Harvest = (function () {

  var instance;

  function startGame() {

    var camera, scene, renderer;
    var controls;
    var objects = [];

    var fog = 100;
    var chatInputActive = false;

    var messageBillboards = new Map();
    var remotePlayerIndicators = new Map();

    var cameraWorldPosition = new THREE.Vector3();
    var forwardVector = new THREE.Vector3();
    var tempVector = new THREE.Vector3();

    init();
    animate();

    function init() {

      eventHandlers();

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xffffff, 0, fog + 1000);

      // Sky dome
      var sky = new THREE.SphereGeometry(8000, 32, 32);
      var skyBox = new THREE.Mesh(sky);
      skyBox.scale.set(-1, 1, 1);
      skyBox.eulerOrder = 'XZY';
      skyBox.renderDepth = 1000.0;
      scene.add(skyBox);

      // Floor
      var floorHeight = 7000;
      var floorGeometry = new THREE.SphereGeometry(floorHeight, 10, 6, 0, (Math.PI * 2), 0, 0.8);
      floorGeometry.applyMatrix(new THREE.Matrix4().makeTranslation(0, -floorHeight, 0));

      var floorTexture = createGridTexture(1024, 32);

      var floorMesh = new THREE.Mesh(
        floorGeometry,
        new THREE.MeshBasicMaterial({ map: floorTexture })
      );
      floorMesh.receiveShadow = false;
      objects.push(floorMesh);
      scene.add(floorMesh);

      camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 1, 9000);
      controls = new THREE.PointerLockControls(camera, 100, 30, true, objects);
      scene.add(controls.getPlayer());

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setClearColor(0xffffff);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      floorTexture.anisotropy = renderer.getMaxAnisotropy();
      ScreenOverlay(controls);
      document.body.appendChild(renderer.domElement);

    }

    function animate() {

      requestAnimationFrame(animate);

      if (controls.enabled) {
        controls.updateControls();
      }

      lookAtCamera(messageBillboards);
      alignRemoteLabels();

      renderer.render(scene, camera);

    }

    function lookAtCamera(collection) {
      collection.forEach(function (entry) {
        if (!entry || !entry.mesh) return;
        entry.mesh.lookAt(camera.position.x, entry.mesh.position.y, camera.position.z);
      });
    }

    function alignRemoteLabels() {
      remotePlayerIndicators.forEach(function (entry) {
        if (entry.label) {
          entry.label.lookAt(camera.position.x, entry.label.position.y, camera.position.z);
        }
      });
    }

    function eventHandlers() {

      var onKeyDown = function (event) {
        if (chatInputActive && event.keyCode !== 27) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleKeyInteraction(event.keyCode, true);
      };
      var onKeyUp = function (event) {
        if (chatInputActive && event.keyCode !== 27) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleKeyInteraction(event.keyCode, false);
      };
      document.addEventListener('keydown', onKeyDown, false);
      document.addEventListener('keyup', onKeyUp, false);

      window.addEventListener('resize', onWindowResize, false);
    }

    function handleKeyInteraction(keyCode, isKeyDown) {
      if (chatInputActive && keyCode !== 27) {
        return;
      }

      switch (keyCode) {
        case 38: // up
        case 87: // w
          controls.movements.forward = isKeyDown;
          break;

        case 40: // down
        case 83: // s
          controls.movements.backward = isKeyDown;
          break;

        case 37: // left
        case 65: // a
          controls.movements.left = isKeyDown;
          break;

        case 39: // right
        case 68: // d
          controls.movements.right = isKeyDown;
          break;

        case 32: // space
          if (!isKeyDown) {
            controls.jump();
          }
          break;

        case 16: // shift
          controls.walk(isKeyDown);
          break;

        case 67: // c
          controls.crouch(isKeyDown);
          break;
      }
    }

    function onWindowResize() {

      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(window.innerWidth, window.innerHeight);

      messageBillboards.forEach(function (entry) {
        if (!entry || !entry.data) return;
        var desiredPosition = entry.data.position || deriveLegacyPosition(entry.data) || {};
        entry.mesh.position.set(
          typeof desiredPosition.x === 'number' ? desiredPosition.x : 0,
          typeof desiredPosition.y === 'number' ? desiredPosition.y : 3,
          typeof desiredPosition.z === 'number' ? desiredPosition.z : 0
        );
      });

    }

    function createGridTexture(size, divisions) {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      var context = canvas.getContext('2d');

      context.fillStyle = '#252525';
      context.fillRect(0, 0, size, size);

      var step = size / divisions;

      for (var i = 0; i <= divisions; i++) {
        var position = Math.round(i * step) + 0.5;

        context.strokeStyle = (i % 8 === 0) ? '#ffffff' : '#555555';
        context.lineWidth = (i % 8 === 0) ? 2 : 1;

        context.beginPath();
        context.moveTo(position, 0);
        context.lineTo(position, size);
        context.stroke();

        context.beginPath();
        context.moveTo(0, position);
        context.lineTo(size, position);
        context.stroke();
      }

      var texture = new THREE.Texture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(60, 60);
      texture.needsUpdate = true;

      return texture;
    }

    function setChatActive(active) {
      chatInputActive = active;
      if (active) {
        controls.movements.forward = false;
        controls.movements.backward = false;
        controls.movements.left = false;
        controls.movements.right = false;
      }
    }

    function getCameraPosition() {
      return camera.getWorldPosition(cameraWorldPosition);
    }

    function getForwardDirection() {
      return controls.getDirection(forwardVector).normalize();
    }

    function computeNotePlacement(distance) {
      var playerPosition = controls.getPlayer().position.clone();
      var direction = getForwardDirection();
      direction.y = 0;
      if (direction.lengthSq() === 0) {
        direction.set(0, 0, -1);
      }
      direction.normalize();

      var offset = (typeof distance === 'number' && !isNaN(distance)) ? distance : 8;
      var targetPosition = playerPosition.clone().add(direction.clone().multiplyScalar(offset));
      targetPosition.y = Math.max(playerPosition.y, 3);

      var yaw = Math.atan2(direction.x, direction.z);

      return {
        position: {
          x: targetPosition.x,
          y: targetPosition.y,
          z: targetPosition.z
        },
        rotationY: yaw
      };
    }

    function deriveLegacyPosition(data) {
      if (!data) {
        return null;
      }

      var hasX = typeof data.x === 'number';
      var hasY = typeof data.y === 'number';

      if (!hasX && !hasY) {
        return null;
      }

      var width = window.innerWidth || 1;
      var height = window.innerHeight || 1;

      var normalizedX = hasX ? (data.x / width) - 0.5 : 0;
      var normalizedY = hasY ? (data.y / height) - 0.5 : 0;

      var spread = 160;

      return {
        x: normalizedX * spread,
        y: 3.5,
        z: -normalizedY * spread
      };
    }

    function ensureMessageEntry(id) {
      var entry = messageBillboards.get(id);
      if (entry) {
        return entry;
      }

      var canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      var context = canvas.getContext('2d');
      context.font = '28px Roboto Mono, monospace';

      var texture = new THREE.Texture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;

      var material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });

      var geometry = new THREE.PlaneGeometry(12, 6);
      var mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = 4;
      mesh.renderOrder = 2;

      entry = {
        mesh: mesh,
        canvas: canvas,
        context: context,
        texture: texture,
        material: material,
        geometry: geometry
      };

      scene.add(mesh);
      messageBillboards.set(id, entry);

      return entry;
    }

    function updateMessageEntry(entry, data) {
      if (!entry || !data) return;

      drawMessage(entry, data);

      entry.data = data;

      var desiredPosition = data.position || deriveLegacyPosition(data) || {};
      entry.mesh.position.set(
        typeof desiredPosition.x === 'number' ? desiredPosition.x : 0,
        typeof desiredPosition.y === 'number' ? desiredPosition.y : 3,
        typeof desiredPosition.z === 'number' ? desiredPosition.z : 0
      );
    }

    function drawMessage(entry, data) {
      var ctx = entry.context;
      var canvas = entry.canvas;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      var author = data.author || 'Anonymous';
      var text = data.text || '';
      var accent = data.accent || '#4ac6ff';

      ctx.fillStyle = accent;
      ctx.font = '32px "Roboto Mono", monospace';
      ctx.fillText(author, 24, 56);

      ctx.fillStyle = '#ffffff';
      ctx.font = '28px "Roboto Mono", monospace';
      wrapText(ctx, text, 24, 108, canvas.width - 48, 34);

      entry.texture.needsUpdate = true;
    }

    function wrapText(context, text, x, y, maxWidth, lineHeight) {
      var words = text.split(/\s+/);
      var line = '';

      for (var n = 0; n < words.length; n++) {
        var testLine = line + words[n] + ' ';
        var metrics = context.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          context.fillText(line, x, y);
          line = words[n] + ' ';
          y += lineHeight;
        } else {
          line = testLine;
        }
      }
      context.fillText(line, x, y);
    }

    function disposeMessage(id) {
      var entry = messageBillboards.get(id);
      if (!entry) return;

      scene.remove(entry.mesh);
      entry.geometry.dispose();
      entry.material.dispose();
      entry.texture.dispose();

      messageBillboards.delete(id);
    }

    function colorForId(id) {
      var hash = 0;
      for (var i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash |= 0;
      }
      var hue = Math.abs(hash) % 360;
      return 'hsl(' + hue + ', 80%, 60%)';
    }

    function createRemoteIndicator(id, data) {
      var group = new THREE.Object3D();

      var material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorForId(id)),
        transparent: true,
        opacity: 0.9
      });
      var cone = new THREE.ConeGeometry(0.8, 2.4, 12);
      var mesh = new THREE.Mesh(cone, material);
      mesh.position.y = 1.2;
      mesh.rotation.x = Math.PI;
      group.add(mesh);

      var label = createNameLabel(data && data.displayName ? data.displayName : '');
      label.position.y = 2.8;
      group.add(label);

      scene.add(group);

      return {
        group: group,
        marker: mesh,
        label: label,
        material: material,
        geometry: cone
      };
    }

    function createNameLabel(text) {
      var canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      var ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = '28px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text || '', canvas.width / 2, canvas.height / 2);

      var texture = new THREE.Texture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;

      var material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });
      var geometry = new THREE.PlaneGeometry(4, 1);
      var mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 3;

      mesh.userData = {
        canvas: canvas,
        context: ctx,
        texture: texture,
        material: material,
        geometry: geometry
      };

      return mesh;
    }

    function updateNameLabel(mesh, text) {
      if (!mesh || !mesh.userData) return;
      var ctx = mesh.userData.context;
      var canvas = mesh.userData.canvas;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = '28px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text || '', canvas.width / 2, canvas.height / 2);

      mesh.userData.texture.needsUpdate = true;
    }

    function upsertRemotePlayer(id, data) {
      var entry = remotePlayerIndicators.get(id);
      if (!entry) {
        entry = createRemoteIndicator(id, data);
        remotePlayerIndicators.set(id, entry);
      }

      if (data && data.displayName) {
        updateNameLabel(entry.label, data.displayName);
      }

      if (data && typeof data.x === 'number' && typeof data.y === 'number' && typeof data.z === 'number') {
        entry.group.position.set(data.x, data.y, data.z);
      }

      entry.group.visible = true;
    }

    function removeRemotePlayer(id) {
      var entry = remotePlayerIndicators.get(id);
      if (!entry) return;

      scene.remove(entry.group);
      entry.geometry.dispose();
      entry.material.dispose();
      if (entry.label) {
        if (entry.label.userData && entry.label.userData.geometry) {
          entry.label.userData.geometry.dispose();
        }
        if (entry.label.userData && entry.label.userData.material) {
          entry.label.userData.material.dispose();
        }
        if (entry.label.userData && entry.label.userData.texture) {
          entry.label.userData.texture.dispose();
        }
      }

      remotePlayerIndicators.delete(id);
    }

    return {
      setFog: function (setFog) {
        fog = setFog;
      },
      setJumpFactor: function (setJumpFactor) {
        controls.jumpFactor = setJumpFactor;
      },
      setChatInputActive: setChatActive,
      getCameraPosition: getCameraPosition,
      getForwardDirection: getForwardDirection,
      computeNotePlacement: computeNotePlacement,
      addOrUpdateMessage: function (id, data) {
        var entry = ensureMessageEntry(id);
        updateMessageEntry(entry, data);
      },
      removeMessage: disposeMessage,
      addOrUpdateRemotePlayer: upsertRemotePlayer,
      removeRemotePlayer: removeRemotePlayer,
      getControls: function () {
        return controls;
      }
    };
  }

  return {
    getInstance: function () {
      if (!instance) {
        instance = startGame();
      }
      return instance;
    }
  };

})();

var harvest = Harvest.getInstance();
