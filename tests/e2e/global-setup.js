// Fresh test database before the browser tests.
export default async function setup() {
  process.env.NODE_ENV = 'test';
  const { default: vitestSetup } = await import('../globalSetup.js');
  await vitestSetup();
}
