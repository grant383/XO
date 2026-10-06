import LoginPage from "../page";
export const metadata = { title: "Sign-in error" };
/** Canonical error deep link; reuses the existing Figma sign-in and server-side auth flow. */
export default function LoginErrorPage(props: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return <LoginPage {...props} failed />;
}
