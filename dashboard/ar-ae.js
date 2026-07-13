const drawer = document.getElementById("drawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const drawerOpeners = Array.from(document.querySelectorAll("[data-drawer-open]"));
const drawerClosers = Array.from(document.querySelectorAll("[data-drawer-close]"));

function openDrawer() {
  document.body.classList.add("drawer-open");
}

function closeDrawer() {
  document.body.classList.remove("drawer-open");
}

drawerOpeners.forEach((button) => {
  button.addEventListener("click", openDrawer);
});

drawerClosers.forEach((button) => {
  button.addEventListener("click", closeDrawer);
});

drawerBackdrop?.addEventListener("click", closeDrawer);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDrawer();
  }
});
