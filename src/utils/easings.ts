export type EasingType = 
  | 'linear' 
  // Sine
  | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
  // Quad
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  // Cubic
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  // Quart
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  // Quint
  | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
  // Expo
  | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo'
  // Circ
  | 'easeInCirc' | 'easeOutCirc' | 'easeInOutCirc'
  // Back
  | 'easeInBack' | 'easeOutBack' | 'easeInOutBack'
  // Elastic
  | 'easeInElastic' | 'easeOutElastic' | 'easeInOutElastic'
  // Bounce
  | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce';

// Helper for Bounce
const easeOutBounceFunc = (x: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) {
      return n1 * x * x;
  } else if (x < 2 / d1) {
      return n1 * (x -= 1.5 / d1) * x + 0.75;
  } else if (x < 2.5 / d1) {
      return n1 * (x -= 2.25 / d1) * x + 0.9375;
  } else {
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }
};

export const easingFunctions: Record<EasingType, (t: number) => number> = {
  // 1. Linear
  linear: (t) => t,

  // Sine (2-4)
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  // Quad (5-7)
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

  // Cubic (8-10) -> Image: 10-12 roughly matches standard Cubic order
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  // Quart (11-13) -> Image: 14-16
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,

  // Quint (14-16) -> Image: 18-20
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
  easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,

  // Expo (17-19) -> Image: 22-24
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,

  // Circ (20-22) -> Image: 26-28
  easeInCirc: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  easeInOutCirc: (t) => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

  // Back (Image: 34-36)
  easeInBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  easeOutBack: (t) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  easeInOutBack: (t) => { const c1 = 1.70158; const c2 = c1 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; },

  // Elastic (Image: 30-32)
  easeInElastic: (t) => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4); },
  easeOutElastic: (t) => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
  easeInOutElastic: (t) => { const c5 = (2 * Math.PI) / 4.5; return t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2 : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1; },

  // Bounce (Image: 38-40)
  easeInBounce: (t) => 1 - easeOutBounceFunc(1 - t),
  easeOutBounce: easeOutBounceFunc,
  easeInOutBounce: (t) => t < 0.5 ? (1 - easeOutBounceFunc(1 - 2 * t)) / 2 : (1 + easeOutBounceFunc(2 * t - 1)) / 2,
};

// 画像の順番に近い形でリスト化
export const easingNames: Record<EasingType, string> = {
  linear: '1. Linear (等速)',
  
  easeInSine: '2. EaseIn Sine',
  easeOutSine: '3. EaseOut Sine',
  easeInOutSine: '4. EaseInOut Sine',

  easeInQuad: '5. EaseIn Quad',
  easeOutQuad: '6. EaseOut Quad',
  easeInOutQuad: '7. EaseInOut Quad', // Image is 8ish

  easeInCubic: '10. EaseIn Cubic',
  easeOutCubic: '11. EaseOut Cubic',
  easeInOutCubic: '12. EaseInOut Cubic',

  easeInQuart: '14. EaseIn Quart',
  easeOutQuart: '15. EaseOut Quart',
  easeInOutQuart: '16. EaseInOut Quart',

  easeInQuint: '18. EaseIn Quint',
  easeOutQuint: '19. EaseOut Quint',
  easeInOutQuint: '20. EaseInOut Quint',

  easeInExpo: '22. EaseIn Expo',
  easeOutExpo: '23. EaseOut Expo',
  easeInOutExpo: '24. EaseInOut Expo',

  easeInCirc: '26. EaseIn Circ',
  easeOutCirc: '27. EaseOut Circ',
  easeInOutCirc: '28. EaseInOut Circ',

  easeInElastic: '30. EaseIn Elastic',
  easeOutElastic: '31. EaseOut Elastic',
  easeInOutElastic: '32. EaseInOut Elastic',

  easeInBack: '34. EaseIn Back',
  easeOutBack: '35. EaseOut Back',
  easeInOutBack: '36. EaseInOut Back',

  easeInBounce: '38. EaseIn Bounce',
  easeOutBounce: '39. EaseOut Bounce',
  easeInOutBounce: '40. EaseInOut Bounce',
};