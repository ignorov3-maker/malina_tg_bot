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

  const galleryItems = cards.map((card, index) => ({
    src: card.href,
    alt: card.querySelector("img")?.alt || `Работа ${index + 1}`,
  }));
  const featuredItems = [
    { slug: "display", src: "assets/portfolio/display.webp", alt: "Фирменная выставочная конструкция для винной продукции" },
    { slug: "award", src: "assets/portfolio/award.webp", alt: "Акриловая награда для школьной футбольной лиги" },
    { slug: "caps", src: "assets/portfolio/caps.webp", alt: "Синие и розовые бейсболки с фирменными шевронами" },
    { slug: "thermoses", src: "assets/portfolio/thermoses.webp", alt: "Партия синих термосов с корпоративной печатью" },
    { slug: "pens", src: "assets/portfolio/pens.webp", alt: "Оранжевые ручки с нанесённой фирменной надписью" },
    { slug: "gift-certificate", src: "assets/portfolio/client-gift-certificate.jpg", alt: "Подарочный сертификат инженерной компании в чёрном конверте" },
    { slug: "calendars", src: "assets/portfolio/calendars.webp", alt: "Настольный календарь, брошюры и карманный календарь типографии Малина" },
    { slug: "presentation-set", src: "assets/portfolio/city-presentation-set.jpg", alt: "Календарь, ежедневник, сумка и ручки с символикой Севастополя" },
    { slug: "stationery", src: "assets/portfolio/branded-stationery.jpg", alt: "Красные ежедневники и термокружка с фирменным персонажем Малины" },
    { slug: "notebooks", src: "assets/portfolio/custom-notebooks.jpg", alt: "Блокноты с индивидуальными логотипами двух брендов" },
  ].map((item) => ({ ...item, src: new URL(item.src, document.baseURI).href }));

  let items = galleryItems;
  let currentIndex = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  const render = (index) => {
    currentIndex = (index + items.length) % items.length;
    image.src = items[currentIndex].src;
    image.alt = items[currentIndex].alt;
    counter.textContent = `${currentIndex + 1} / ${items.length}`;

    const preload = (offset) => {
      const preloadImage = new Image();
      preloadImage.src = items[(currentIndex + offset + items.length) % items.length].src;
    };
    preload(-1);
    preload(1);
  };

  const open = (nextItems, index) => {
    items = nextItems;
    render(index);
    if (!dialog.open) dialog.showModal();
    closeButton?.focus();
  };

  cards.forEach((card, index) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      open(galleryItems, index);
    });
  });

  const bindTap = (button, action) => {
    if (!button) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      action();
    });
    button.addEventListener("touchend", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    }, { passive: false });
  };

  bindTap(closeButton, () => dialog.close());
  bindTap(previousButton, () => render(currentIndex - 1));
  bindTap(nextButton, () => render(currentIndex + 1));

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

  const requestedWork = new URLSearchParams(window.location.search).get("work");
  const requestedIndex = featuredItems.findIndex(({ slug }) => slug === requestedWork);
  if (requestedIndex >= 0) open(featuredItems, requestedIndex);
})();
