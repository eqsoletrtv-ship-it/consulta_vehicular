const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  $("loginBtn").onclick = () => {
    $("loginPanel").classList.toggle("hidden");
    $("adminPanel").classList.add("hidden");
  };
  $("loginForm").onsubmit = login;
  $("vehicleForm").onsubmit = saveVehicle;
  const s = await fetch("/api/session").then(r=>r.json()).catch(()=>({authenticated:false}));
  if(s.authenticated) showAdmin();
});

async function login(e){
  e.preventDefault();
  const r = await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("username").value,password:$("password").value})});
  const d = await r.json();
  if(!r.ok){$("loginError").textContent=d.error||"Error";return}
  $("loginError").textContent="";
  showAdmin();
}

async function showAdmin(){
  $("loginPanel").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
  await loadVehicles();
}

async function logout(){
  await fetch("/api/logout",{method:"POST"});
  location.reload();
}

async function loadVehicles(){
  const r=await fetch("/api/vehicles");
  if(!r.ok)return;
  const list=await r.json();
  $("rows").innerHTML=list.map(v=>`
    <tr>
      <td><strong>${esc(v.plate)}</strong></td>
      <td>${esc([v.brand,v.model,v.year].filter(Boolean).join(" "))}</td>
      <td>${esc(v.status)}</td>
      <td>
        <button onclick="editVehicle(${v.id})">Editar</button>
        <button onclick="showQR(${v.id})">QR</button>
        <button onclick="deleteVehicle(${v.id})">Eliminar</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="4">No hay registros.</td></tr>`;
}

function payload(){
  return {
    plate:$("plate").value, vehicle_type:$("vehicle_type").value, brand:$("brand").value,
    model:$("model").value, year:$("year").value, color:$("color").value, service:$("service").value,
    issue_date:$("issue_date").value, expiry_date:$("expiry_date").value, status:$("status").value,
    owner:$("owner").value, notes:$("notes").value
  };
}

async function saveVehicle(e){
  e.preventDefault();
  const id=$("vehicleId").value;
  const r=await fetch(id?"/api/vehicles/"+id:"/api/vehicles",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload())});
  const d=await r.json();
  $("adminMsg").textContent=r.ok?"Registro guardado.":(d.error||"Error");
  $("adminMsg").style.color=r.ok?"#027a48":"#b42318";
  if(r.ok){resetForm();loadVehicles();}
}

async function editVehicle(id){
  const v=await fetch("/api/vehicles/"+id).then(r=>r.json());
  $("vehicleId").value=v.id;
  for(const k of ["plate","vehicle_type","brand","model","year","color","service","issue_date","expiry_date","status","owner","notes"]) $(k).value=v[k]||"";
  window.scrollTo({top:$("vehicleForm").offsetTop-80,behavior:"smooth"});
}

async function deleteVehicle(id){
  if(!confirm("¿Eliminar este registro?"))return;
  const r=await fetch("/api/vehicles/"+id,{method:"DELETE"});
  if(r.ok)loadVehicles();
}

async function showQR(id){
  const d=await fetch("/api/vehicles/"+id+"/qr").then(r=>r.json());
  const w=window.open("","qr","width=520,height=650");
  w.document.write(`<title>QR ${esc(d.url)}</title><body style="font-family:Arial;text-align:center;padding:25px"><h2>QR de consulta</h2><img style="width:430px;max-width:90%" src="${d.dataUrl}"><p>${esc(d.url)}</p><button onclick="window.print()">Imprimir</button></body>`);
}

function resetForm(){
  $("vehicleForm").reset();$("vehicleId").value="";$("vehicle_type").value="Motocicleta";$("service").value="Particular";$("status").value="Vigente";
}

async function searchPlate(){
  const p = $("plateSearch").value.trim().toUpperCase().replace(/\s+/g,"");
  const result = $("result");

  if(!p){
    result.innerHTML = `<div class="result-error">Ingresa una placa para consultar.</div>`;
    return;
  }

  result.innerHTML = `<div class="result-loading">Consultando...</div>`;

  try {
    const r = await fetch("/api/public/vehicles?plate=" + encodeURIComponent(p));
    const d = await r.json();

    if(!r.ok){
      result.innerHTML = `
        <div class="result-error">
          ${esc(d.error || "No se encontró el vehículo.")}
        </div>
      `;
      return;
    }

    result.innerHTML = `
      <div class="vehicle-result">
        <div class="result-header">
          <div>
            <span class="result-label">VEHÍCULO CONSULTADO</span>
            <h2>${esc(d.plate)}</h2>
          </div>
          <span class="status">${esc(d.status || "—")}</span>
        </div>

        <div class="vehicle-grid">
          <div><strong>Tipo de vehículo</strong><span>${esc(d.vehicle_type || "—")}</span></div>
          <div><strong>Marca</strong><span>${esc(d.brand || "—")}</span></div>
          <div><strong>Modelo</strong><span>${esc(d.model || "—")}</span></div>
          <div><strong>Año</strong><span>${esc(d.year || "—")}</span></div>
          <div><strong>Color</strong><span>${esc(d.color || "—")}</span></div>
          <div><strong>Servicio</strong><span>${esc(d.service || "—")}</span></div>
          <div><strong>Fecha de emisión</strong><span>${esc(d.issue_date || "—")}</span></div>
          <div><strong>Fecha de vencimiento</strong><span>${esc(d.expiry_date || "—")}</span></div>
          <div class="wide"><strong>Propietario</strong><span>${esc(d.owner || "—")}</span></div>
        </div>

        <div class="private-note">
          Sistema privado de consulta. La información mostrada corresponde al registro almacenado en este sistema.
        </div>
      </div>
    `;

  } catch (e) {
    result.innerHTML = `
      <div class="result-error">
        No se pudo realizar la consulta.
      </div>
    `;
  }
}

function esc(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
