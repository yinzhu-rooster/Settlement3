# UI/UX Strategy

---

## Layout

```
+--------------------------------------------------+
|  Top Bar: Player info, VP count, turn timer       |
|  +----------------------------------------------+ |
|  |  PixiJS Canvas (hex board, pieces, anims)    | |
|  +----------------------------------------------+ |
|  Bottom Panel: Resources, actions, trade, cards   |
+--------------------------------------------------+
```

- Board = PixiJS canvas (center, fills available space)
- All UI chrome = React + Tailwind overlaid on top
- Mobile: full-screen board + collapsible bottom sheet, minimal top bar
- Touch: pinch-to-zoom, drag-to-pan on PixiJS canvas

## Visual Style

- **Palette**: Earthy tones — warm tan background, green/brown/yellow/grey/red for resources, deep navy for ocean
- **Typography**: Merriweather or Playfair Display for headings (serif, board game feel), Inter for body/UI text
- **Player colors**: Red, blue, white, orange (classic Catan)

## Board Rendering Details

- Hex tiles: Textured sprites (AI-generated)
- Number tokens: Circular sprites, text overlay. Red for 6 and 8
- Vertices: Invisible hit areas, ghost settlement on hover during placement
- Edges: Invisible hit areas, ghost road on hover
- Settlements/cities: Colored sprites per player (use PixiJS tint for color variants)
- Zoomable and pannable (PixiJS viewport plugin or manual gesture handling)

## Responsive Design

- Desktop (>1024px): Side panels for player info, bottom bar for resources/actions
- Mobile (<768px): Full-screen board, collapsible bottom sheet (slide up) for resources/actions, minimal top bar
- Trade dialogs: Radix UI Sheet (slide-up) on mobile, Dialog (modal) on desktop
- Touch gestures: pinch-to-zoom, drag-to-pan via `@pixi/ui` or Hammer.js
- Minimum viewport: 375px wide (iPhone SE)

## Animations (GSAP or PixiJS ticker)

- **Dice roll**: Sprite animation — tumbling die frames, land on result
- **Resource collection**: Particle-like icons floating from hex to player's resource bar
- **Building placement**: Scale-up + bounce easing
- **Robber movement**: Slide animation between hexes

---

## Interaction Flows

### Trade Flow

1. Player clicks "Trade" → trade panel opens
2. Select resources to offer (from your hand) and resources to request
3. Choose target: "All players" or a specific player
4. Offer appears for target player(s) as a notification card
5. Recipients can: **Accept**, **Reject**, or **Counter-offer** (pre-fills a new offer with swapped resources)
6. Initiator can **Cancel** the offer at any time before acceptance
7. On accept: resources swap instantly, trade panel closes, brief animation

### Discard Flow (7 Rolled, >7 Cards)

1. Dice result shows 7 → screen dims, modal overlay appears for all players with >7 cards
2. Modal shows your hand and a target count (half, rounded down)
3. Click resources to select them for discard. Counter shows "X / Y selected"
4. Confirm button enables when exactly Y cards selected
5. All players discard simultaneously — waiting indicator shows who hasn't discarded yet
6. After all discards resolve → active player enters robber placement

### Dev Card Play Flow

1. Player clicks dev card in hand → card enlarges with "Play" button
2. Confirm play → effect activates:
   - **Knight**: Enter robber placement flow (pick hex → pick steal target)
   - **Road Building**: Place 2 roads sequentially (same placement UX as normal, but free)
   - **Year of Plenty**: Resource picker appears — choose any 2 resources from bank
   - **Monopoly**: Resource type picker — choose 1 type, all other players surrender that type
3. Grey out dev card button after playing one this turn

### Action Error Feedback

1. When a player attempts an invalid action (wrong phase, insufficient resources, invalid placement, building limit reached), a toast notification appears
2. Toast is non-blocking — appears at the top or bottom of the screen, does not interrupt gameplay
3. Brief message describing the error (e.g., "Not enough resources to build a settlement", "You can't place here")
4. Toast auto-dismisses after 2-3 seconds, or can be manually dismissed
5. Styled with a subtle error color (muted red/orange) to indicate the action was rejected without being alarming

### Robber Placement + Steal

1. All non-desert hexes highlight as valid targets (current robber hex excluded)
2. Player clicks a hex → robber moves there (slide animation)
3. If any opponents have settlements/cities on that hex, their player icons appear as steal targets
4. Click a player icon to steal 1 random resource → brief "stolen!" animation
5. If no opponents are adjacent, robber just moves — no steal

---

## AI Asset Generation — Tools

- **Hex tiles**: Recraft AI or Scenario.gg for consistent flat-illustration style (512x512 PNG)
- **Icons**: Recraft SVG mode for resource/building/dev card icons; Game-icons.net for supplemental SVGs
- **Player pieces**: Simple geometric shapes — house, tower, thick line. PixiJS tint for player colors.
- **UI screens**: v0.dev for rapid React + Tailwind prototyping (lobby, trade dialogs, leaderboard)
- **Animations**: Rive for micro-interactions, SVGator for animated SVGs
- **Splash art**: Midjourney or DALL-E for non-gameplay screens
- **Sound**: Howler.js + free SFX libraries
