<!-- 443de5c2-90fd-49b1-ae11-d49f4da755f6 bc645db8-f31c-4d9b-839a-9a3911f69a5e -->
# Fix linkAgent Action Handler Return Values

## Problem

The `linkAgentAction.handler` in `packages/plugin-hyperscape/src/actions/linkAgent.ts` does not return `ActionResult` objects, causing the action to fail silently and break action chaining in ElizaOS.

## Solution

Add proper `ActionResult` return statements at all 5 exit points in the handler function.

## Changes Required

### File: `packages/plugin-hyperscape/src/actions/linkAgent.ts`

**1. Line 74 - Invalid challenge code error**

Replace bare `return;` with:

```typescript
return {
  text: "I couldn't find a valid challenge code. Please provide a 6-character code (example: A3B7C2)",
  success: false,
  values: { linked: false, error: "invalid_code" },
  data: { source: "hyperscape", action: "LINK_AGENT" },
};
```

**2. Line 116 - Token exchange failed**

Replace bare `return;` with:

```typescript
return {
  text: `Failed to exchange challenge code: ${errorData.error || "Unknown error"}`,
  success: false,
  values: { linked: false, error: errorData.error || "Unknown error" },
  data: { source: "hyperscape", action: "LINK_AGENT" },
};
```

**3. Line 148 - Service not found**

Replace bare `return;` with:

```typescript
return {
  text: "Token obtained but Hyperscape service not available. Please ensure the plugin is loaded.",
  success: false,
  values: { linked: false, tokenObtained: true, error: "service_not_found" },
  data: { source: "hyperscape", action: "LINK_AGENT", userId },
};
```

**4. After Line 180 - Success case**

Add return statement:

```typescript
return {
  text: `Successfully linked to user ${userId} and connected to Hyperscape!`,
  success: true,
  values: { 
    linked: true, 
    userId, 
    scopes,
    restrictions,
  },
  data: { 
    source: "hyperscape", 
    action: "LINK_AGENT",
    userId,
    token,
  },
};
```

**5. After Line 190 - Catch block error**

Add return statement:

```typescript
return {
  text: `Failed to link agent: ${errorMsg}`,
  success: false,
  values: { linked: false, error: errorMsg },
  data: { source: "hyperscape", action: "LINK_AGENT" },
};
```

## Verification

After changes, the handler will:

- Return proper ActionResult at all exit points
- Allow ElizaOS to properly chain actions
- Provide clear success/failure indicators
- Match the pattern used by all other actions (reply, lightFire, continue, etc.)