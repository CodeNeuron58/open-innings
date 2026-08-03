/// <reference types="nativewind/types" />

// The `import '../global.css'` in app/_layout.tsx is what hands the Tailwind
// build to NativeWind's Metro transformer — it has no runtime export, so
// TypeScript needs telling that a bare .css import is legitimate.
declare module '*.css';
