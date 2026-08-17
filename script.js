const dialog = document.querySelector("[data-brief-dialog]");
const openButtons = document.querySelectorAll("[data-open-brief]");
const closeButtons = document.querySelectorAll("[data-close-brief]");

const openDialog = () => {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
};

const closeDialog = () => {
  if (!dialog) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
};

openButtons.forEach((button) => button.addEventListener("click", openDialog));
closeButtons.forEach((button) => button.addEventListener("click", closeDialog));

dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dialog?.open) closeDialog();
});
