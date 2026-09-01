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
  /** 球体主体填充：深蓝半透明（球体轮廓/暗侧基色，配合 sphereFillLit 做受光渐变） */
  sphereFill: 'rgba(20, 40, 70, 0.35)',
  /** 球体"受光面"填充：比 sphereFill 更亮，从左上角向外过渡出去，制造真实球体的明暗立体感 */
  sphereFillLit: 'rgba(54, 92, 145, 0.42)',
  /**
   * 经纬网格线 RGB 分量：按到球心距离动态生成径向渐变（中心稍亮，靠近轮廓边缘淡出），
   * 避免整张网格线不分远近、密度均匀导致的"钢丝球"感
   */
  graticuleRGB: '90, 140, 190',
  /** 陆地线框描边 + 发光色 */
  landStroke: '#5ee1ff',
  landGlow: '#7dd3fc',
  /** 陆地极低填充，制造"面板玻璃"质感而非纯线框的空洞感 */
  landFill: 'rgba(94, 225, 255, 0.04)',
  /** 球体轮廓描边 */
  sphereRim: 'rgba(125, 211, 252, 0.55)',
  /** 扫描经线 RGB 分量（用于按透明度动态拼接 rgba 字符串） */
  scanRGB: '139, 233, 255',
  /** 大气层发光渐变 RGB 分量，同时复用为陆地线框的中心高亮色（两者色相一致） */
  atmosphereRGB: '94, 225, 255',
  /** 标记点：在线 = 固定青蓝色，离线 = 中性灰，不再跟随站点 primary 色 */
  markerAccent: '#5ee1ff',
  markerOffline: 'rgba(148, 163, 184, 0.6)',
  /** 枢纽放射飞线 */
  flylineColor: 'rgba(125, 211, 252, 0.5)',
  flylineGlow: '#a5f3fc',
  /**
   * 悬浮控件（模式切换/飞线开关/统计角标）的深色玻璃质感底色与文字色：
   * 面板本身固定深色科技风格，不随站点主题变化，浮在其上的控件也不再套用
   * 跟随站点浅/深色主题的 bg-background，避免"浅色浮层贴在深空球体上"的割裂感
   */
  panelGlassBg: 'rgba(9, 20, 40, 0.6)',
  panelTextMuted: 'rgba(207, 232, 255, 0.72)',
  panelTextActive: '#eafcff',
  /** 控件选中态底色与描边 */
  activeChipBg: 'rgba(94, 225, 255, 0.18)',
  activeChipRing: 'rgba(94, 225, 255, 0.5)',
} as const
