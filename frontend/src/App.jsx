import { useAuth, SignInButton, UserButton } from "@clerk/react";

export default function App() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;

  return (
    <div>
      {!isSignedIn && <SignInButton />}
      {isSignedIn && (
        <>
          <UserButton />
          <h1>Ticketing System</h1>
        </>
      )}
    </div>
  );
}
