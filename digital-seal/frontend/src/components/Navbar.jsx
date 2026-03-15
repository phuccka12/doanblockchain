import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ethers } from "ethers";
import { SEPOLIA_CHAIN_ID_HEX } from "../config";

const NAV = [
  { to:"/",          label:"Trang chủ",  icon:"🏠" },
  { to:"/dashboard", label:"Dashboard",  icon:"📊" },
  { to:"/studio",    label:"Studio",     icon:"🔒" },
  { to:"/verify",    label:"Giám định",  icon:"🔬" },
  { to:"/provenance",label:"Gia Phả",    icon:"🌳" },
  { to:"/explorer",  label:"NFT Explorer",icon:"🗂️" },
];

export default function Navbar() {
  const [addr, setAddr] = useState("");
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  const connect = async () => {
    if (!window.ethereum) { alert("Cài MetaMask!"); return; }
    try {
      const p = new ethers.BrowserProvider(window.ethereum);
      const accs = await p.send("eth_requestAccounts",[]);
      const cid  = await window.ethereum.request({method:"eth_chainId"});
      if (cid !== SEPOLIA_CHAIN_ID_HEX)
        await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:SEPOLIA_CHAIN_ID_HEX}]});
      setAddr(accs[0]);
    } catch(e){ console.error(e); }
  };

  const s = {
    nav:   { position:"sticky",top:0,zIndex:50,background:"rgba(8,8,24,.92)",
             backdropFilter:"blur(16px)",borderBottom:"1px solid rgba(255,255,255,.07)",
             fontFamily:"Inter,system-ui,sans-serif" },
    inner: { maxWidth:1180,margin:"0 auto",padding:"0 24px",
             display:"flex",alignItems:"center",justifyContent:"space-between",height:60 },
    logo:  { display:"flex",alignItems:"center",gap:10,textDecoration:"none" },
    logoIcon: { width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:15,fontWeight:900,color:"#fff",flexShrink:0 },
    logoTxt: { fontSize:17,fontWeight:800,background:"linear-gradient(90deg,#a5b4fc,#c4b5fd)",
               WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" },
    desktopNav: { display:"flex",alignItems:"center",gap:2 },
    link: (active) => ({
      display:"flex",alignItems:"center",gap:6,padding:"7px 13px",
      borderRadius:10,fontSize:13,fontWeight:500,textDecoration:"none",
      transition:"all .15s",
      color: active?"#c7d2fe":"#64748b",
      background: active?"rgba(99,102,241,.15)":"transparent",
      border: active?"1px solid rgba(99,102,241,.3)":"1px solid transparent",
    }),
    walletOn:  { display:"flex",alignItems:"center",gap:8,padding:"7px 14px",
                 borderRadius:20,background:"rgba(74,222,128,.1)",
                 border:"1px solid rgba(74,222,128,.25)",fontSize:13,fontWeight:600,color:"#4ade80" },
    walletOff: { padding:"8px 18px",borderRadius:20,border:"none",cursor:"pointer",
                 background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                 color:"#fff",fontSize:13,fontWeight:600 },
    dot: (c) => ({ width:7,height:7,borderRadius:"50%",background:c,flexShrink:0 }),
  };

  return (
    <nav style={s.nav}>
      <div style={s.inner}>
        <Link to="/" style={s.logo}>
          <div style={s.logoIcon}>T</div>
          <span style={s.logoTxt}>TrustLens</span>
        </Link>

        <div style={s.desktopNav}>
          {NAV.map(({to,label,icon})=>(
            <Link key={to} to={to} style={s.link(loc.pathname===to)}>
              <span>{icon}</span>{label}
            </Link>
          ))}
        </div>

        <div>
          {addr ? (
            <div style={s.walletOn}>
              <span style={s.dot("#4ade80")}/>
              {addr.slice(0,6)}...{addr.slice(-4)}
            </div>
          ) : (
            <button onClick={connect} style={s.walletOff}>🔑 Kết nối Ví</button>
          )}
        </div>
      </div>
    </nav>
  );
}
