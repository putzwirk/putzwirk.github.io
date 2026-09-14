import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="landing">
      <h1>Putzwirk's public page</h1>
      <Link className="btn btn-accent btn-lg" to="/lucidblocks/mods">
        <img className="btn-icon" src="/lucid_blocks.ico" alt="" />
        Lucid blocks modding
      </Link>
    </div>
  );
}
