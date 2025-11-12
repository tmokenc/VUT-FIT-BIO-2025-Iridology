# Iridology Map Feature

## Overview

The iridology map feature overlays a comprehensive iridological chart on detected iris images, dividing the iris into zones that correspond to different body organs and systems according to traditional iridology principles.

## How It Works

### 1. Detection Phase

First, the system detects:

- **Pupil** - The dark center of the eye (marked in red)
- **Iris** - The colored part of the eye (marked in green)
- **Middle Circle** - Intermediate zone (marked in blue)

### 2. Mapping Phase

Once detection is complete, you can toggle "Show Iridology Map" to overlay:

#### Radial Zones (Concentric Rings)

The iris is divided into 5 concentric zones from pupil to outer edge:

1. **Stomach Zone** (innermost, 0-35%) - Red tint
   - Digestive system center
2. **Intestines Zone** (35-65%) - Orange tint
   - Intestinal health and absorption
3. **Organs/Glands Zone** (65-85%) - Green tint
   - Major organs and endocrine glands
4. **Circulation/Lymph Zone** (85-95%) - Blue tint
   - Circulatory and lymphatic systems
5. **Skin/Elimination Zone** (outermost, 95-100%) - Purple tint
   - Skin and elimination organs

#### Sectoral Divisions (Pie Slices)

The iris is divided into angular sectors representing specific organs:

**Right Eye Map:**

- 0-30° (3 o'clock): Liver
- 30-45°: Gallbladder
- 45-70°: Right Kidney
- 70-85°: Right Adrenal Gland
- 85-100°: Pancreas
- 100-120°: Spleen
- 120-150°: Right Arm
- 150-170°: Right Shoulder
- 170-210°: Right Bronchi/Lung
- 210-240°: Throat
- 240-270°: Neck
- 270-300°: Right Leg
- 300-330°: Right Hip
- 330-360°: Appendix

**Left Eye Map:**

- 0-30° (3 o'clock): Left Shoulder
- 30-60°: Left Arm
- 60-80°: Heart (unique to left eye)
- 80-95°: Pancreas
- 95-110°: Left Adrenal Gland
- 110-135°: Left Kidney
- 135-150°: Gallbladder
- 150-180°: Liver
- 180-210°: Spleen
- 210-240°: Left Hip
- 240-270°: Left Leg
- 270-300°: Neck
- 300-330°: Throat
- 330-10°: Left Bronchi/Lung

### 3. Interactive Features

#### Hover Tooltips

When the iridology map is enabled:

- Move your mouse over different areas of the iris
- The cursor changes to a pointer when over a mapped zone
- Tooltips display the organ name and radial zone
- Example: "Liver (Organs/Glands)"

#### Visual Legend

Each sector is color-coded and labeled with white text outside the iris boundary for easy identification.

## Usage

1. **Upload or capture an eye image** using the file input or camera button
2. **Wait for detection** - The system will automatically detect pupil and iris
3. **Toggle the map** - Check "Show Iridology Map" to overlay the iridological chart
4. **Explore zones** - Hover over different areas to see organ associations
5. **Compare eyes** - Use both left and right eye panels to see bilateral differences

## Technical Implementation

### Files

- `src/iridologyMap.js` - Core iridology mapping logic
- `src/main.js` - Integration with iris detection
- `src/iris.js` - Iris and pupil detection algorithms

### Key Functions

#### `drawIridologyMap(ctx, iris, pupil, eye, options)`

Draws the complete iridology overlay on canvas

- **ctx**: Canvas 2D context
- **iris**: Iris circle {x, y, r}
- **pupil**: Pupil circle {x, y, r}
- **eye**: 'left' or 'right'
- **options**: Display settings

#### `createInteractiveMap(canvas, iris, pupil, eye)`

Adds mouse hover interactivity

- Returns cleanup function to remove event listeners

#### `drawRadialZoneLegend(ctx, x, y)`

Draws a legend explaining the radial zones (not currently used in UI but available)

## Customization

You can customize the map appearance in `iridologyMap.js`:

```javascript
// Modify zone colors
const RADIAL_ZONES = [
  {
    name: "Stomach",
    innerRatio: 0,
    outerRatio: 0.35,
    color: "rgba(255, 107, 107, 0.3)",
  },
  // ... modify colors here
];

// Modify sector definitions
const RIGHT_EYE_SECTORS = [
  {
    name: "Liver",
    startAngle: 0,
    endAngle: 30,
    color: "rgba(139, 69, 19, 0.4)",
  },
  // ... modify sectors here
];
```

## Important Notes

⚠️ **Medical Disclaimer**: This is an educational and research tool. Iridology is considered an alternative practice and is not scientifically validated for medical diagnosis. Always consult qualified healthcare professionals for medical advice.

## Future Enhancements

Potential improvements:

- [ ] Export annotated images with iridology map
- [ ] Add more detailed organ subdivisions
- [ ] Implement customizable map templates
- [ ] Add image comparison between left and right eyes
- [ ] Support for different iridology chart standards (Jensen, Deck, etc.)
- [ ] Pattern recognition for iris markings and signs
- [ ] PDF report generation with findings

## References

The iridology map is based on traditional iridology charts developed by:

- Dr. Bernard Jensen (American iridology)
- Josef Deck (German iridology)
- Standard iris topology charts

## Browser Compatibility

Works in modern browsers supporting:

- HTML5 Canvas
- ES6 JavaScript modules
- OpenCV.js (WebAssembly)
- Mouse events for interactivity
