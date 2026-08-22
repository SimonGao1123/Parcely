import { UserButton } from "@clerk/nextjs";
import MeCard from "./MeCard";
import FileUploadTest from "./FileUploadTest";
export default function Home() {
  
  return (
    <div>
      <h1>Hello World</h1>
      <UserButton />
      <MeCard />
      <FileUploadTest />
    </div>
  );
}
