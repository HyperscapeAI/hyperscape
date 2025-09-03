import { test, expect, Page, Browser, BrowserContext } from '@playwright/test'
import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

// Increase timeout for game loading
test.setTimeout(60000)

interface DiagnosticReport {
  playerPosition?: { x: number; y: number; z: number }
  baseExists?: boolean
  baseInScene?: boolean
  baseVisible?: boolean
  avatarExists?: boolean
  avatarVisible?: boolean
  avatarInScene?: boolean
  avatarMeshCount?: number
  avatarParent?: string
  moving?: boolean
  clickTarget?: { x: number; z: number } | null
  errors?: string[]
}

async function captureScreenshot(page: Page, name: string) {
  const screenshotPath = path.join(__dirname, '../../logs', `${name}-${Date.now()}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`Screenshot saved: ${screenshotPath}`)
  return screenshotPath
}

async function extractDiagnostics(page: Page): Promise<DiagnosticReport> {
  return await page.evaluate(() => {
    const report: any = {}
    
    // Access world from window
    const world = (window as any).world
    if (!world) {
      report.errors = ['World not found on window']
      return report
    }
    
    // Find local player
    let player: any = null
    const entities = world.entities as any
    if (entities?.items && entities.items instanceof Map) {
      for (const [_id, entity] of entities.items) {
        if (entity.isLocal && entity.isPlayer) {
          player = entity
          break
        }
      }
    }
    
    if (!player) {
      report.errors = ['Local player not found']
      return report
    }
    
    // Player position
    if (player.position) {
      report.playerPosition = {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z
      }
    }
    
    // Base status
    const base = player.base
    report.baseExists = !!base
    if (base) {
      report.baseVisible = base.visible
      
      // Check if in scene
      let parent = base.parent
      let depth = 0
      let inScene = false
      while (parent && depth < 10) {
        if (parent === world.stage?.scene) {
          inScene = true
          break
        }
        parent = parent.parent
        depth++
      }
      report.baseInScene = inScene
    }
    
    // Avatar status
    const avatar = player._avatar || player.avatar
    report.avatarExists = !!avatar
    if (avatar) {
      report.avatarVisible = avatar.visible
      report.avatarParent = avatar.parent === base ? 'base' : avatar.parent?.name || 'none'
      
      // Check if in scene
      let parent = avatar.parent
      let depth = 0
      let inScene = false
      while (parent && depth < 10) {
        if (parent === world.stage?.scene) {
          inScene = true
          break
        }
        parent = parent.parent
        depth++
      }
      report.avatarInScene = inScene
      
      // Count meshes
      let meshCount = 0
      if (avatar.traverse) {
        avatar.traverse((child: any) => {
          if (child.isMesh) meshCount++
        })
      }
      report.avatarMeshCount = meshCount
    }
    
    // Movement state
    report.moving = player.moving
    if (player.clickMoveTarget) {
      report.clickTarget = {
        x: player.clickMoveTarget.x,
        z: player.clickMoveTarget.z
      }
    } else {
      report.clickTarget = null
    }
    
    return report
  })
}

async function simulateMovement(page: Page, x: number, z: number) {
  // Click on the game canvas to move
  await page.evaluate(({x, z}) => {
    const world = (window as any).world
    if (!world) return
    
    // Find local player
    let player: any = null
    const entities = world.entities as any
    if (entities?.items && entities.items instanceof Map) {
      for (const [_id, entity] of entities.items) {
        if (entity.isLocal && entity.isPlayer) {
          player = entity
          break
        }
      }
    }
    
    if (player && player.clickMoveTarget) {
      // Set movement target directly
      player.clickMoveTarget.set(x, 0, z)
      console.log(`[Test] Set movement target to (${x}, ${z})`)
    }
  }, {x, z})
}

test.describe('Client Movement and Avatar Tests', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  
  test.beforeAll(async () => {
    console.log('Starting browser...')
    browser = await chromium.launch({
      headless: false, // Set to true for CI
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    })
    page = await context.newPage()
    
    // Capture console logs
    page.on('console', msg => {
      const text = msg.text()
      if (text.includes('[ClientDiagnostics]') || 
          text.includes('[PlayerLocal]') || 
          text.includes('Error') ||
          text.includes('Avatar')) {
        console.log(`[Browser Console] ${text}`)
      }
    })
    
    // Capture errors
    page.on('pageerror', error => {
      console.error(`[Browser Error] ${error.message}`)
    })
  })
  
  test.afterAll(async () => {
    await browser.close()
  })
  
  test('Game loads and player spawns', async () => {
    console.log('Navigating to game...')
    await page.goto('http://localhost:4444', { waitUntil: 'networkidle' })
    
    // Wait for game to initialize
    console.log('Waiting for game to load...')
    await page.waitForTimeout(5000)
    
    // Take initial screenshot
    await captureScreenshot(page, 'initial-load')
    
    // Get diagnostics
    const diagnostics = await extractDiagnostics(page)
    console.log('Initial Diagnostics:', JSON.stringify(diagnostics, null, 2))
    
    // Assertions
    expect(diagnostics.playerPosition).toBeDefined()
    expect(diagnostics.baseExists).toBe(true)
    expect(diagnostics.baseInScene).toBe(true)
  })
  
  test('Avatar loads and is visible', async () => {
    // Wait for avatar to load
    console.log('Waiting for avatar to load...')
    await page.waitForTimeout(3000)
    
    // Get diagnostics
    const diagnostics = await extractDiagnostics(page)
    console.log('Avatar Diagnostics:', JSON.stringify(diagnostics, null, 2))
    
    // Take screenshot
    await captureScreenshot(page, 'avatar-loaded')
    
    // Assertions
    expect(diagnostics.avatarExists).toBe(true)
    expect(diagnostics.avatarInScene).toBe(true)
    expect(diagnostics.avatarMeshCount).toBeGreaterThan(0)
    
    // Log detailed avatar info
    if (!diagnostics.avatarExists) {
      console.error('❌ AVATAR NOT FOUND!')
    } else if (!diagnostics.avatarInScene) {
      console.error('❌ AVATAR NOT IN SCENE!')
    } else if (!diagnostics.avatarVisible) {
      console.error('❌ AVATAR NOT VISIBLE!')
    } else if (diagnostics.avatarMeshCount === 0) {
      console.error('❌ AVATAR HAS NO MESHES!')
    } else {
      console.log('✅ Avatar loaded successfully')
    }
  })
  
  test('Player movement works', async () => {
    // Get initial position
    const initialDiagnostics = await extractDiagnostics(page)
    const initialPos = initialDiagnostics.playerPosition!
    console.log(`Initial position: (${initialPos.x.toFixed(2)}, ${initialPos.z.toFixed(2)})`)
    
    // Simulate movement
    console.log('Simulating movement to (10, 10)...')
    await simulateMovement(page, 10, 10)
    
    // Wait for movement
    await page.waitForTimeout(5000)
    
    // Get final position
    const finalDiagnostics = await extractDiagnostics(page)
    const finalPos = finalDiagnostics.playerPosition!
    console.log(`Final position: (${finalPos.x.toFixed(2)}, ${finalPos.z.toFixed(2)})`)
    
    // Take screenshot
    await captureScreenshot(page, 'after-movement')
    
    // Calculate distance moved
    const distance = Math.sqrt(
      Math.pow(finalPos.x - initialPos.x, 2) + 
      Math.pow(finalPos.z - initialPos.z, 2)
    )
    console.log(`Distance moved: ${distance.toFixed(2)} units`)
    
    // Assertion
    expect(distance).toBeGreaterThan(1)
    
    if (distance < 1) {
      console.error('❌ PLAYER DID NOT MOVE!')
    } else {
      console.log('✅ Movement successful')
    }
  })

  test('Remote player appears with avatar and moves when local moves', async () => {
    // Use a separate browser context to avoid sharing auth/localStorage
    const context2 = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const page2 = await context2.newPage()
    await page2.goto('http://localhost:4444', { waitUntil: 'networkidle' })
    await page2.waitForTimeout(4000)

    // On page1 (local), move a bit to trigger network updates
    await simulateMovement(page, 5, 5)
    await page.waitForTimeout(3000)

    // On page2, try to find a remote player entity (not isLocal)
    const remoteReport = await page2.evaluate(() => {
      const result: any = { found: false }
      const world = (window as any).world
      if (!world) return result
      const entities = world.entities as any
      if (entities?.items && entities.items instanceof Map) {
        for (const [_id, entity] of entities.items) {
          if (entity.isPlayer && !entity.isLocal) {
            result.found = true
            result.position = entity.position ? { x: entity.position.x, y: entity.position.y, z: entity.position.z } : null
            const avatar = entity._avatar || entity.avatar
            result.avatarExists = !!avatar
            if (avatar && avatar.instance && avatar.instance.raw && avatar.instance.raw.scene) {
              // Check that the VRM scene is attached to world.stage.scene
              let parent = avatar.instance.raw.scene.parent
              let inScene = false
              let depth = 0
              while (parent && depth < 10) {
                if (parent === world.stage?.scene) { inScene = true; break }
                parent = parent.parent
                depth++
              }
              result.avatarInScene = inScene
            } else {
              result.avatarInScene = false
            }
            break
          }
        }
      }
      return result
    })

    // Validate remote presence and avatar
    expect(remoteReport.found).toBeTruthy()
    expect(remoteReport.avatarExists).toBeTruthy()
    // Avatar scene may take a moment; allow a soft assertion
    if (!remoteReport.avatarInScene) {
      // wait briefly and re-check
      await page2.waitForTimeout(2000)
      const recheck = await page2.evaluate(() => {
        const world = (window as any).world
        const entities = world?.entities as any
        if (entities?.items && entities.items instanceof Map) {
          for (const [_id, entity] of entities.items) {
            if (entity.isPlayer && !entity.isLocal) {
              const avatar = entity._avatar || entity.avatar
              if (avatar && avatar.instance && avatar.instance.raw && avatar.instance.raw.scene) {
                let parent = avatar.instance.raw.scene.parent
                let inScene = false
                let depth = 0
                while (parent && depth < 10) {
                  if (parent === world.stage?.scene) { inScene = true; break }
                  parent = parent.parent
                  depth++
                }
                return inScene
              }
            }
          }
        }
        return false
      })
      expect(recheck).toBeTruthy()
    }

    await page2.close()
    await context2.close()
  })

  test('Server-driven player movement replicates to client in realtime', async () => {
    // Open a fresh client
    const pageA = await context.newPage()
    await pageA.goto('http://localhost:4444', { waitUntil: 'networkidle' })
    await pageA.waitForTimeout(3000)

    // Capture initial position of local player on client
    const initial = await pageA.evaluate(() => {
      const world = (window as any).world
      const entities = world?.entities as any
      let player: any = null
      if (entities?.items && entities.items instanceof Map) {
        for (const [_id, entity] of entities.items) {
          if (entity.isLocal && entity.isPlayer) { player = entity; break }
        }
      }
      if (!player) return null
      return { x: player.position.x, y: player.position.y, z: player.position.z }
    })
    expect(initial).not.toBeNull()

    // Send a chat command to ask the server to move the player randomly
    // The server command handler (/move) will apply movement and broadcast entityModified updates.
    await pageA.evaluate(() => {
      const input = document.querySelector('input[placeholder="Type a message"]') as HTMLInputElement | null
      if (input) {
        input.value = '/move random'
        const evt = new KeyboardEvent('keydown', { key: 'Enter' })
        input.dispatchEvent(evt)
      } else {
        // Fallback: directly enqueue a command packet if chat UI is not present
        const world = (window as any).world
        const net = world?.network as any
        if (net && typeof net.send === 'function') {
          net.send('command', ['/move','random'])
        }
      }
    })

    // Wait for replication to apply
    await pageA.waitForTimeout(1000)

    // Verify client sees the new position
    const after = await pageA.evaluate(() => {
      const world = (window as any).world
      const player = world?.entities?.player
      if (!player) return null
      return { x: player.position.x, y: player.position.y, z: player.position.z }
    })
    expect(after).not.toBeNull()
    const dx = Math.hypot((after!.x - initial!.x), (after!.z - initial!.z))
    expect(dx).toBeGreaterThan(1)

    await pageA.close()
  })

  test('Server bot appears as remote, moves randomly, and plays walk/run emote when moving', async () => {
    // Open a separate client to observe the server bot
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    const p = await ctx.newPage()
    await p.goto('http://localhost:4444', { waitUntil: 'networkidle' })
    await p.waitForTimeout(6000)

    // Find a non-local player (server bot) and sample its position and emote state
    const botInfo1 = await p.evaluate(() => {
      const world = (window as any).world
      const out: any = { found: false }
      if (!world) return out
      const entities = world.entities as any
      if (entities?.items && entities.items instanceof Map) {
        for (const [_id, e] of entities.items) {
          if (e.isPlayer && !e.isLocal) {
            out.found = true
            out.id = e.id
            out.pos = { x: e.position.x, y: e.position.y, z: e.position.z }
            const av = e._avatar || e.avatar
            out.emote = av?.emote ?? null
            return out
          }
        }
      }
      return out
    })
    expect(botInfo1.found).toBeTruthy()

    // Wait for random movement loop to advance
    await p.waitForTimeout(5000)

    const botInfo2 = await p.evaluate((id) => {
      const world = (window as any).world
      const out: any = { found: false }
      if (!world) return out
      const entities = world.entities as any
      const target = entities?.get?.(id) || (entities?.items?.get ? entities.items.get(id) : null)
      const e = target || (() => {
        if (entities?.items && entities.items instanceof Map) {
          for (const [_i, ent] of entities.items) {
            if (ent.id === id) return ent
          }
        }
        return null
      })()
      if (e) {
        out.found = true
        out.pos = { x: e.position.x, y: e.position.y, z: e.position.z }
        const av = e._avatar || e.avatar
        out.emote = av?.emote ?? null
      }
      return out
    }, botInfo1.id)
    expect(botInfo2.found).toBeTruthy()

    const dist = Math.hypot((botInfo2.pos.x - botInfo1.pos.x), (botInfo2.pos.z - botInfo1.pos.z))
    expect(dist).toBeGreaterThan(0.5)

    // Emote may be null on first frames; allow walk/run or idle if speed low
    // We assert that when moved a noticeable distance, emote should not remain idle consistently
    const movedEnough = dist > 2
    if (movedEnough) {
      const emoteUrl: string | null = botInfo2.emote
      const isMovingEmote = !!emoteUrl && (emoteUrl.includes('emote-walk') || emoteUrl.includes('emote-run'))
      expect(isMovingEmote).toBeTruthy()
    }

    await p.close()
    await ctx.close()
  })
  
  test('Collect all console errors', async () => {
    // Collect any errors from the page
    const errors = await page.evaluate(() => {
      return (window as any).__collectedErrors || []
    })
    
    if (errors.length > 0) {
      console.error('Page errors collected:', errors)
    }
    
    expect(errors.length).toBe(0)
  })
})

// Also export a standalone test runner
export async function runClientTest() {
  console.log('=== STARTING AUTOMATED CLIENT TEST ===')
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    })
    const page = await context.newPage()
    
    // Capture all console logs
    const logs: string[] = []
    page.on('console', msg => {
      const text = msg.text()
      logs.push(text)
      console.log(`[Browser] ${text}`)
    })
    
    // Navigate to game
    console.log('Loading game...')
    await page.goto('http://localhost:4444', { waitUntil: 'networkidle' })
    await page.waitForTimeout(5000)
    
    // Get diagnostics
    const diagnostics = await extractDiagnostics(page)
    
    // Print report
    console.log('\n=== DIAGNOSTIC REPORT ===')
    console.log('Player Position:', diagnostics.playerPosition)
    console.log('Base Exists:', diagnostics.baseExists)
    console.log('Base In Scene:', diagnostics.baseInScene)
    console.log('Avatar Exists:', diagnostics.avatarExists)
    console.log('Avatar Visible:', diagnostics.avatarVisible)
    console.log('Avatar In Scene:', diagnostics.avatarInScene)
    console.log('Avatar Mesh Count:', diagnostics.avatarMeshCount)
    console.log('========================\n')
    
    // Save logs
    const logPath = path.join(__dirname, '../../logs', `client-test-${Date.now()}.log`)
    fs.writeFileSync(logPath, logs.join('\n'))
    console.log(`Logs saved to: ${logPath}`)
    
    // Take final screenshot
    await captureScreenshot(page, 'final-state')
    
  } finally {
    await browser.close()
  }
  
  console.log('=== CLIENT TEST COMPLETE ===')
}

// Run if called directly
if (require.main === module) {
  runClientTest().catch(console.error)
}
