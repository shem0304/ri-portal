// Minimal module declaration for d3-cloud.
// Many installs of d3-cloud ship without TypeScript type declarations.
// This keeps the project building under TypeScript strict mode.
declare module 'd3-cloud' {
  const cloud: any;
  export default cloud;
}
