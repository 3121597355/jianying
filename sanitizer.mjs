// Vercel's runtime loader cannot require the sanitizer's ESM dependencies.
// Use the build-time bundle there, keeping the same library and security rules.
const {default: sanitizeHtml} = await import(process.env.VERCEL ? './sanitizer.bundle.cjs' : 'sanitize-html');
export default sanitizeHtml;
