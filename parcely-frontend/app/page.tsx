import { UserButton } from "@clerk/nextjs";
import MeCard from "./MeCard";
export default function Home() {
  
  return (
    <div>
      <h1>Hello World</h1>
      <UserButton />
      <MeCard />
    </div>
  );
}
