/**
 * 三维地球固定深色科技配色。
 *
 * 有意不接入 `useThemeVars()`：地球被设计成一个独立的监控大屏面板，
 * 不应随全站浅/深色模式切换而改变外观——无论站点是浅色还是深色主题，
 * 这块面板始终呈现同一套深空 + 青蓝线框科技风格。
 */
export const GLOBE_THEME = {
  /** 容器深空径向渐变：中心稍亮的深蓝 -> 边缘近黑 */
  spaceFrom: '#0a1830',
  spaceTo: '#040b16',
  /** 面板固定边框色（替代跟随站点主题的 ring-border） */
  panelBorder: 'rgba(94, 225, 255, 0.16)',
  /** 球体主体填充：深蓝半透明 */
  sphereFill: 'rgba(20, 40, 70, 0.35)',
  /** 经纬网格线：暗青灰，衬托陆地线框 */
  graticule: 'rgba(90, 140, 190, 0.22)',
  /** 陆地线框描边 + 发光色 */
  landStroke: '#5ee1ff',
  landGlow: '#7dd3fc',
  /** 陆地极低填充，制造"面板玻璃"质感而非纯线框的空洞感 */
  landFill: 'rgba(94, 225, 255, 0.04)',
  /** 球体轮廓描边 */
  sphereRim: 'rgba(125, 211, 252, 0.55)',
  /** 扫描经线 RGB 分量（用于按透明度动态拼接 rgba 字符串） */
  scanRGB: '139, 233, 255',
  /** 大气层发光渐变 RGB 分量 */
  atmosphereRGB: '94, 225, 255',
  /** 标记点：在线 = 固定青蓝色，离线 = 中性灰，不再跟随站点 primary 色 */
  markerAccent: '#5ee1ff',
  markerOffline: 'rgba(148, 163, 184, 0.6)',
  /** 枢纽放射飞线 */
  flylineColor: 'rgba(125, 211, 252, 0.5)',
  flylineGlow: '#a5f3fc',
} as const
