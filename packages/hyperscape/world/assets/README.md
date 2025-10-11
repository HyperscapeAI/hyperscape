# Hyperscape World Assets

## Asset Manifest System

All game data (mobs, items, NPCs) is defined in JSON manifests:
- `manifests/mobs.json` - Mob definitions
- `manifests/items.json` - Item definitions  
- `manifests/npcs.json` - NPC definitions

TypeScript code loads from these JSONs at runtime, keeping data separate from code.

## 3D Models

Models are referenced in manifests via `modelPath` fields:

### Current Model Status

**Available Base Models:**
- `goblin/goblin_rigged.glb`
- `thug/thug_rigged.glb`
- `human/human_rigged.glb`
- `troll/troll_rigged.glb`
- `imp/imp_rigged.glb`

**Model Reuse:**
- Bandit → uses `thug` model
- Barbarian → uses `human` model
- Guard → uses `human` model
- Black Knight → uses `human` model
- Ice Warrior → uses `human` model
- Dark Ranger → uses `human` model
- Hobgoblin → uses `troll` model
- Dark Warrior → uses `imp` model

### 404 Errors Are NORMAL

When you see errors like:
```
{"message":"Route GET:/world-assets/forge/goblin/goblin_rigged.glb not found","error":"Not Found","statusCode":404}
```

**This is expected and harmless!** The game:
1. Tries to load the GLB model
2. Gets 404 (file doesn't exist yet)
3. Catches the error gracefully
4. Falls back to colored capsule shapes
5. **Game works perfectly with fallback visuals**

The 404s only go away when you generate actual 3D models.

## Generating 3D Models

To generate the actual GLB files:

```bash
cd packages/3d-asset-forge
bun run assets:generate-missing --priority critical --limit 5
```

This generates:
- bronze_hatchet
- fishing_rod  
- goblin model
- bandit model
- adventurer avatar

**Until models are generated, the game uses clean fallback shapes (capsules for mobs, spheres for items).**

## Current Game State

✅ **Fully Functional Without 3D Models:**
- Mob spawning works
- Combat system works (auto-attack loop)
- Resource gathering works (trees, fishing)
- Visual fallbacks are clean (no purple cubes!)
- All systems operational

🎨 **With 3D Models (Optional):**
- Better visual fidelity
- Proper character models
- Weapon/armor models
- Environment assets

The game is playable NOW with fallback visuals, models are just cosmetic upgrades!
