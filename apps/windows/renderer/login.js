import { yc, $, errText, applySettings } from "./common.js";
import { smileySvg } from "./smileys.js";

$("#logo").innerHTML = smileySvg("grin", "Zahu!Messenger").replace('width="22" height="22"', 'width="64" height="64"');
const params = new URLSearchParams(location.search);
const st = await applySettings();
$("#li-id").value = st.settings.lastIdentifier ?? "";
$("#li-remember").checked = st.settings.rememberMe !== false;
$("#api-base").value = st.settings.apiBase;
if (params.get("message")) $("#li-err").textContent = params.get("message");
($("#li-id").value ? $("#li-pw") : $("#li-id")).focus();

// ---- tab ----
const tabs = ["login", "register", "recover"];
for (const t of tabs) {
  $(`#tab-${t}`).addEventListener("click", () => {
    for (const u of tabs) {
      $(`#tab-${u}`).setAttribute("aria-selected", String(u === t));
      $(`#pane-${u}`).classList.toggle("hidden", u !== t);
    }
  });
}
const busy = async (form, fn, errEl) => {
  const btns = form.querySelectorAll("button");
  btns.forEach((b) => (b.disabled = true));
  errEl.textContent = "";
  try { await fn(); } catch (e) { errEl.textContent = errText(e); } finally { btns.forEach((b) => (b.disabled = false)); }
};

// ---- đăng nhập ----
$("#pane-login").addEventListener("submit", (ev) => {
  ev.preventDefault();
  busy(ev.target, async () => {
    await yc.app("settings", { rememberMe: $("#li-remember").checked });
    await yc.app("login", $("#li-id").value.trim(), $("#li-pw").value);
  }, $("#li-err"));
});

// ---- đăng ký ----
let reg = {};
for (const r of document.querySelectorAll('input[name="rg-ch"]')) {
  r.addEventListener("change", () => {
    const phone = r.value === "phone" && r.checked;
    $("#rg-addr-label").textContent = phone ? "Số điện thoại" : "Email";
    $("#rg-addr").type = phone ? "tel" : "email";
  });
}
const show = (id) => ["#rg-step1", "#rg-step2", "#rg-step3"].forEach((s) => $(s).classList.toggle("hidden", s !== id));
$("#rg-step1").addEventListener("submit", (ev) => {
  ev.preventDefault();
  busy(ev.target, async () => {
    const channel = document.querySelector('input[name="rg-ch"]:checked').value;
    const r = await yc.call("registerStart", $("#rg-code").value.trim(), channel, $("#rg-addr").value.trim());
    reg = { registrationId: r.registrationId };
    $("#rg-sent").textContent = `Đã gửi mã tới ${$("#rg-addr").value.trim()}. Mã hết hạn sau 10 phút.`;
    show("#rg-step2"); $("#rg-otp").focus();
  }, $("#rg-err"));
});
$("#rg-back").addEventListener("click", () => show("#rg-step1"));
$("#rg-step2").addEventListener("submit", (ev) => {
  ev.preventDefault();
  busy(ev.target, async () => {
    const r = await yc.call("registerVerify", reg.registrationId, $("#rg-otp").value.trim());
    reg.verificationToken = r.verificationToken;
    show("#rg-step3"); $("#rg-nick").focus();
  }, $("#rg-err"));
});
$("#rg-step3").addEventListener("submit", (ev) => {
  ev.preventDefault();
  busy(ev.target, async () => {
    if ($("#rg-pw").value !== $("#rg-pw2").value) throw new Error("Hai mật khẩu không khớp");
    await yc.app("registerComplete", reg.verificationToken, $("#rg-pw").value, $("#rg-nick").value.trim());
  }, $("#rg-err"));
});

// ---- khôi phục ----
let rec = {};
$("#rc-step1").addEventListener("submit", (ev) => {
  ev.preventDefault();
  busy(ev.target, async () => {
    rec = await yc.call("recoveryStart", $("#rc-addr").value.trim());
    $("#rc-step1").classList.add("hidden"); $("#rc-step2").classList.remove("hidden"); $("#rc-otp").focus();
  }, $("#rc-err"));
});
$("#rc-step2").addEventListener("submit", (ev) => {
  ev.preventDefault();
  busy(ev.target, async () => {
    await yc.call("recoveryComplete", rec.recoveryId, $("#rc-otp").value.trim(), $("#rc-pw").value);
    $("#rc-step2").classList.add("hidden"); $("#rc-step1").classList.remove("hidden");
    $("#tab-login").click();
    $("#li-err").textContent = "Đã đặt lại mật khẩu. Mọi phiên cũ đã bị đăng xuất. Hãy đăng nhập lại.";
  }, $("#rc-err"));
});

// ---- máy chủ ----
$("#api-save").addEventListener("click", async () => {
  await yc.app("settings", { apiBase: $("#api-base").value.trim() });
  await yc.app("newCore");
  $("#li-err").textContent = "Đã lưu địa chỉ máy chủ.";
});
