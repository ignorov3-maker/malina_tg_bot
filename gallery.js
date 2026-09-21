(() => {
  "use strict";

  const cards = [...document.querySelectorAll(".reference-card")];
  const dialog = document.querySelector(".gallery-lightbox");
  const image = dialog?.querySelector(".lightbox-image");
  const counter = dialog?.querySelector(".lightbox-counter");
  const closeButton = dialog?.querySelector(".lightbox-close");
  const previousButton = dialog?.querySelector(".lightbox-prev");
  const nextButton = dialog?.querySelector(".lightbox-next");

  if (!cards.length || !dialog || !image || !counter) return;

  let currentIndex = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  const render = (index) => {
    currentIndex = (index + cards.length) % cards.length;
    const cardImage = cards[currentIndex].querySelector("img");
    image.src = cards[currentIndex].href;
    image.alt = cardImage?.alt || `Работа ${currentIndex + 1}`;
    counter.textContent = `${currentIndex + 1} / ${cards.length}`;

    const preload = (offset) => {
      const preloadImage = new Image();
      preloadImage.src = cards[(currentIndex + offset + cards.length) % cards.length].href;
    };
    preload(-1);
    preload(1);
  };

  const open = (index) => {
    render(index);
    if (!dialog.open) dialog.showModal();
    closeButton?.focus();
  };

  cards.forEach((card, index) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      open(index);
    });
  });

  closeButton?.addEventListener("click", () => dialog.close());
  previousButton?.addEventListener("click", () => render(currentIndex - 1));
  nextButton?.addEventListener("click", () => render(currentIndex + 1));

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      render(currentIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      render(currentIndex + 1);
    }
  });

  dialog.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  dialog.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    render(currentIndex + (deltaX < 0 ? 1 : -1));
  }, { passive: true });

  dialog.addEventListener("close", () => {
    image.removeAttribute("src");
  });
})();
