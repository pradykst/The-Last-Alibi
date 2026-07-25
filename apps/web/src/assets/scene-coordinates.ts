export const SCENE_DESIGN_WIDTH = 1920;
export const SCENE_DESIGN_HEIGHT = 1080;

export type SceneTransform = Readonly<{
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
}>;

export type ScenePoint = Readonly<{ x: number; y: number }>;

export function getSceneTransform(viewportWidth: number, viewportHeight: number): SceneTransform {
  const safeWidth = Math.max(0, viewportWidth);
  const safeHeight = Math.max(0, viewportHeight);
  const scale =
    safeWidth === 0 || safeHeight === 0
      ? 0
      : Math.min(safeWidth / SCENE_DESIGN_WIDTH, safeHeight / SCENE_DESIGN_HEIGHT);
  const renderedWidth = SCENE_DESIGN_WIDTH * scale;
  const renderedHeight = SCENE_DESIGN_HEIGHT * scale;
  return {
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: (safeWidth - renderedWidth) / 2,
    offsetY: (safeHeight - renderedHeight) / 2,
  };
}

export function designToScreen(point: ScenePoint, transform: SceneTransform): ScenePoint {
  return {
    x: transform.offsetX + point.x * transform.scale,
    y: transform.offsetY + point.y * transform.scale,
  };
}

export function screenToDesign(point: ScenePoint, transform: SceneTransform): ScenePoint | null {
  if (transform.scale === 0) return null;
  const x = (point.x - transform.offsetX) / transform.scale;
  const y = (point.y - transform.offsetY) / transform.scale;
  if (x < 0 || x > SCENE_DESIGN_WIDTH || y < 0 || y > SCENE_DESIGN_HEIGHT) return null;
  return { x, y };
}

export function designPointToPercent(point: ScenePoint): {
  left: `${number}%`;
  top: `${number}%`;
} {
  return {
    left: `${(point.x / SCENE_DESIGN_WIDTH) * 100}%`,
    top: `${(point.y / SCENE_DESIGN_HEIGHT) * 100}%`,
  };
}
