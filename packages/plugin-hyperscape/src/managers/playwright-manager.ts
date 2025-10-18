import { IAgentRuntime, elizaLogger as logger } from "@elizaos/core";
import { THREE, Player } from "@hyperscape/shared";
import fs, { promises as fsPromises } from "fs";
import path from "path";
import { chromium, Browser, Page, PageScreenshotOptions } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { HyperscapeService } from "../service";
import { getModuleDirectory, resolveUrl } from "../utils";
import { GRAPHICS_CONFIG } from "../config/constants";

interface AvatarLike {
  url?: string;
}

export class PlaywrightManager {
  private static instance: PlaywrightManager | null = null;

  private runtime: IAgentRuntime;
  private browser: Browser;
  private page: Page;
  private initPromise: Promise<void> | null = null;
  private _initialized: boolean = false;
  private disposed: boolean = false;
  private readonly STRIP_SLOTS = [
    "map",
    "aoMap",
    "alphaMap",
    "bumpMap",
    "normalMap",
    "metalnessMap",
    "roughnessMap",
    "emissiveMap",
    "lightMap",
  ] as const;

  /**
   * Get the current page instance for testing purposes
   */
  getPage(): Page | null {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    return this.page || null;
  }

  /**
   * Take a screenshot for testing purposes
   */
  async takeScreenshot(
    options?: PageScreenshotOptions,
  ): Promise<string | Buffer> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    return await this.page!.screenshot({
      type: "png",
      fullPage: false,
      ...options,
    });
  }

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.init();

    if (!PlaywrightManager.instance) {
      PlaywrightManager.instance = this;
    } else {
      throw new Error("PlaywrightManager has already been instantiated.");
    }
  }

  public static getInstance(): PlaywrightManager {
    if (!this.instance) {
      throw new Error(
        "PlaywrightManager not yet initialized. Call new PlaywrightManager(runtime) first.",
      );
    }
    return this.instance;
  }

  // Removed duplicate getPage method - keeping the one at line 34

  private async init() {
    // Check if already disposed
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed and cannot be reinitialized");
    }

    // Only initialize once
    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.browser = await chromium.launch({
          headless: true,
          args: ["--disable-web-security"],
          slowMo: 50,
        });

        this.page = await this.browser.newPage();
        const moduleDirPath = getModuleDirectory();
        const filePath = `${moduleDirPath}/playwright/index.html`;

        await this.page.goto(`file://${filePath}`, { waitUntil: "load" });

        await this.injectScripts([
          `${moduleDirPath}/scripts/createVRMFactory.js`,
          `${moduleDirPath}/scripts/snapshotEquirectangular.js`,
          `${moduleDirPath}/scripts/snapshotFacingDirection.js`,
          `${moduleDirPath}/scripts/snapshotViewToTarget.js`,
        ]);

        // Inject graphics configuration into window object for use by scripts
        await this.page.evaluate((config) => {
          window.GRAPHICS_CONFIG = config;
        }, GRAPHICS_CONFIG);

        await this.page.waitForFunction(
          () =>
            window.scene !== undefined &&
            window.camera !== undefined &&
            window.renderer !== undefined,
        );

        this._initialized = true;
      })();
    }
    return this.initPromise;
  }

  private async injectScripts(scriptPaths: string[]) {
    for (const relativePath of scriptPaths) {
      const absPath = path.resolve(relativePath);
      const content = await fsPromises.readFile(absPath, "utf8");
      await this.page.addScriptTag({ content });
    }
  }

  public async snapshotFacingDirection(
    direction: "front" | "back" | "left" | "right",
  ): Promise<string> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    await this.init();

    if (!this.browser || !this.page) {
      console.warn(
        "[PlaywrightManager] Playwright not available, skipping screenshot",
      );
      return "";
    }

    const service = this.getService();
    const world = service.getWorld();
    const player = world.entities.player;

    if (!player) {
      throw new Error("Player entity not yet available");
    }

    // Note: Rotation control implementation deferred - current player rotation is sufficient

    await this.rehydrateSceneAssets();

    const playerData = {
      position: player.node.position.toArray() as [number, number, number],
      rotation: player.rotation.toArray() as [number, number, number, number],
    };

    const base64 = await this.page.evaluate(async (playerData) => {
      return await window.snapshotFacingDirection(playerData);
    }, playerData);

    const filePath = path.resolve(`scene_facing_${direction}.jpeg`);
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

    return `data:image/jpeg;base64,${base64}`;
  }

  public async snapshotViewToTarget(
    targetPosition: [number, number, number],
  ): Promise<string> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    await this.init();

    const service = this.getService();
    const world = service.getWorld();
    const player = world.entities.player;

    if (!player) {
      throw new Error("Player entity not yet available");
    }

    await this.rehydrateSceneAssets();

    const playerData = {
      position: player.node.position.toArray() as [number, number, number],
    };

    const base64 = (await this.page.evaluate(
      async ({ playerData, targetPosition }) => {
        return await window.snapshotViewToTarget(playerData, targetPosition);
      },
      { playerData, targetPosition },
    )) as string;

    const filePath = path.resolve("scene_view_to_target.jpeg");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

    return `data:image/jpeg;base64,${base64}`;
  }

  public async snapshotEquirectangular(): Promise<string> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    await this.init();

    const service = this.getService();
    const world = service.getWorld();
    const player = world.entities.player;

    if (!player) {
      throw new Error("Player entity not yet available");
    }

    await this.rehydrateSceneAssets();

    const playerData = {
      position: player.node.position.toArray(),
      quaternion: player.node.quaternion.toArray(),
    };

    const base64 = await this.page.evaluate(async (playerData) => {
      return await window.snapshotEquirectangular(playerData);
    }, playerData);

    const buffer = Buffer.from(base64, "base64");
    const filePath = path.resolve("scene_equirectangular.jpeg");
    fs.writeFileSync(filePath, buffer);

    return `data:image/jpeg;base64,${base64}`;
  }

  async loadGlbBytes(url: string): Promise<number[]> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    await this.init();
    const STRIP_SLOTS = this.STRIP_SLOTS;

    return this.page.evaluate(
      async ({
        url,
        STRIP_SLOTS,
      }: {
        url: string;
        STRIP_SLOTS: readonly string[];
      }) => {
        const loader = new window.GLTFLoader();
        const gltf = await loader.loadAsync(url);

        if (!window.texturesMap) {
          window.texturesMap = new Map();
        }

        gltf.scene.traverse((obj) => {
          // Type narrowing - check if object is a Mesh
          if (
            !("isMesh" in obj) ||
            !(obj as THREE.Mesh).isMesh ||
            !("material" in obj) ||
            !(obj as THREE.Mesh).material
          ) {
            return;
          }

          const mesh = obj as THREE.Mesh;
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];

          mats.forEach((mat) => {
            if (!mat.userData.materialId) {
              mat.userData.materialId = window.crypto.randomUUID();
            }
            const id = mat.userData.materialId;

            STRIP_SLOTS.forEach((slot) => {
              const tex = mat[slot] as THREE.Texture;
              if (tex && tex.isTexture) {
                window.texturesMap.set(`${id}:${slot}`, tex);
                mat[slot] = null;
              }
            });

            mat.needsUpdate = true;
          });
        });

        const exporter = new window.GLTFExporter();
        const buffer = await new Promise<ArrayBuffer>((done) =>
          exporter.parse(gltf.scene, done, { binary: true, embedImages: true }),
        );

        return [...new Uint8Array(buffer)];
      },
      { url, STRIP_SLOTS },
    );
  }

  async loadVRMBytes(url: string): Promise<number[]> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    await this.init();

    return this.page.evaluate(async (url) => {
      const loader = window.VRMLoader;
      const gltf = await loader.loadAsync(url);
      const factory = window.createVRMFactory(gltf, (m) => m);

      window.renderer.render(window.scene, window.camera);

      if (!window.avatarMap) {
        window.avatarMap = new Map();
      }
      window.avatarMap.set(url, factory); // Store a deep clone of the avatar

      const exporter = new window.GLTFExporter();
      const buffer = await new Promise<ArrayBuffer>((done) =>
        exporter.parse(gltf.scene, done, { binary: true, embedImages: true }),
      );

      return [...new Uint8Array(buffer)];
    }, url);
  }

  async registerTexture(url: string, slot: string): Promise<string> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    await this.init();

    return this.page.evaluate(
      async ({ url, slot }: { url: string; slot: string }) => {
        if (!window.texturesMap) {
          window.texturesMap = new Map();
        }

        const loader = window.TextureLoader;
        const texture = await new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(
            url,
            (tex) => resolve(tex),
            undefined,
            (err) => reject(err),
          );
        });

        const uuid = window.crypto.randomUUID();
        window.texturesMap.set(`${uuid}:${slot}`, texture);

        return uuid;
      },
      { url, slot },
    );
  }

  public async loadEnvironmentHDR(url: string): Promise<void> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    await this.init();
    const service = this.getService();
    const world = service.getWorld();

    url = await resolveUrl(url, world);

    await this.page.evaluate(async (url) => {
      const loader = new window.HDRLoader();
      const hdrTexture = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });

      window.environment = hdrTexture;
      window.scene.environment = hdrTexture;
      window.scene.background = hdrTexture;

      window.renderer.render(window.scene, window.camera);
    }, url);
  }

  private async rehydrateSceneAssets() {
    const service = this.getService();
    const world = service.getWorld();
    const sceneJson = world.stage.scene.toJSON();

    const players = world.entities.players;

    const STRIP_SLOTS = this.STRIP_SLOTS;
    await this.page.evaluate(
      async ({
        sceneJson,
        STRIP_SLOTS,
        players,
      }: {
        sceneJson: ReturnType<THREE.Scene["toJSON"]>;
        STRIP_SLOTS: readonly string[];
        players: Map<string, Player>;
      }) => {
        // THREE is available via import maps in index.html
        const loader = new THREE.ObjectLoader();
        const loadedScene = loader.parse(sceneJson);

        // Rehydrate materials
        loadedScene.traverse((obj) => {
          // Type narrowing - check if object is a Mesh
          if (
            !("isMesh" in obj) ||
            !(obj as THREE.Mesh).isMesh ||
            !("material" in obj) ||
            !(obj as THREE.Mesh).material
          ) {
            return;
          }

          const mesh = obj as THREE.Mesh;
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];

          mats.forEach((mat) => {
            const id = mat.userData.materialId;
            if (!id) {
              return;
            }

            STRIP_SLOTS.forEach((slot) => {
              const key = `${id}:${slot}`;
              const tex = window.texturesMap?.get(key);
              if (tex && tex.isTexture) {
                mat[slot] = tex;
              }
            });

            mat.needsUpdate = true;
          });
        });

        // Rehydrate player avatars
        if (window.activeVRMInstances) {
          for (const inst of window.activeVRMInstances) {
            inst.destroy();
          }
        }
        window.activeVRMInstances = [];

        players.forEach((player) => {
          if (!player.avatar) {
            return;
          }
          const avatarKey =
            typeof player.avatar === "string"
              ? player.avatar
              : (player.avatar as AvatarLike)?.url || "";
          const factory = window.avatarMap?.get(avatarKey);
          if (!factory) {
            return;
          }

          const vrmHooks = {
            camera: window.camera,
            scene: loadedScene,
            octree: null,
            setupMaterial: () => {},
            loader: window.VRMLoader,
          };
          const instance = factory.create(
            new THREE.Matrix4(),
            vrmHooks,
            (m) => m,
          );

          const position = player.node.position as THREE.Vector3;
          const rotation = player.node.quaternion;
          const scale = player.node.scale as THREE.Vector3;

          const matrix = new THREE.Matrix4();
          matrix.compose(position, rotation, scale);
          instance.move(matrix);

          window.activeVRMInstances.push(instance);
        });

        // Rehydrate environment
        if (window.environment) {
          (loadedScene as THREE.Scene).environment = window.environment;
          (loadedScene as THREE.Scene).background = window.environment;
        }

        window.scene = loadedScene as THREE.Scene;
        window.renderer.render(window.scene, window.camera);
      },
      { sceneJson, STRIP_SLOTS, players },
    );
  }

  /**
   * Cleanup browser resources
   * Call this when done with Playwright to free up memory
   */
  async dispose(): Promise<void> {
    // Set disposed flag immediately to prevent reinitialization
    this.disposed = true;

    // If initialization is in progress, wait for it to complete
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch (error) {
        logger.warn("[PlaywrightManager] Initialization failed during disposal:", error);
      }
    }

    // Close browser if it exists
    if (this.browser) {
      try {
        await this.browser.close();
        logger.info("[PlaywrightManager] Browser closed and resources cleaned up");
      } catch (error) {
        logger.error("[PlaywrightManager] Error closing browser:", error);
      }
    }

    // Clear all references
    this.page = null!;
    this.browser = null!;
    this.initPromise = null;
    this._initialized = false;

    // Clear singleton instance
    PlaywrightManager.instance = null;
  }

  /**
   * Compare screenshots for visual regression testing
   * Uses pixel-level comparison with configurable threshold
   *
   * @param screenshot1 - First screenshot (Buffer or base64 string)
   * @param screenshot2 - Second screenshot (Buffer or base64 string)
   * @param threshold - Acceptable difference threshold (0-1), default 0.1 for rendering variance
   * @returns Object with match status and difference percentage
   */
  async compareScreenshots(
    screenshot1: Buffer | string,
    screenshot2: Buffer | string,
    threshold: number = 0.1,
  ): Promise<{ match: boolean; difference: number }> {
    if (this.disposed) {
      throw new Error("PlaywrightManager has been disposed");
    }
    // Convert to buffers if needed
    const buffer1 = typeof screenshot1 === 'string'
      ? Buffer.from(screenshot1, 'base64')
      : screenshot1;
    const buffer2 = typeof screenshot2 === 'string'
      ? Buffer.from(screenshot2, 'base64')
      : screenshot2;

    // Parse PNG images
    const img1 = PNG.sync.read(buffer1);
    const img2 = PNG.sync.read(buffer2);

    // Verify image dimensions match
    if (img1.width !== img2.width || img1.height !== img2.height) {
      logger.warn(`[PlaywrightManager] Screenshot dimensions mismatch: img1=${img1.width}x${img1.height}, img2=${img2.width}x${img2.height}`);
      return { match: false, difference: 1 };
    }

    // Prepare output buffer for diff visualization (optional)
    const { width, height } = img1;
    const diff = new PNG({ width, height });

    // Perform pixel-level comparison
    // Note: threshold 0.1 is pixelmatch's per-pixel color sensitivity threshold (0-1 scale)
    const numDiffPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 }
    );

    const totalPixels = width * height;
    const difference = numDiffPixels / totalPixels;
    const match = difference <= threshold;

    logger.info(`[PlaywrightManager] Screenshot comparison: ${numDiffPixels}/${totalPixels} pixels differ (${(difference * 100).toFixed(2)}% vs threshold ${(threshold * 100).toFixed(2)}%), match=${match}`);

    return { match, difference };
  }

  private getService() {
    return this.runtime.getService<HyperscapeService>(
      HyperscapeService.serviceName,
    );
  }
}
