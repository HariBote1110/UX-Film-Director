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