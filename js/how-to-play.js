/* Animated mission preview */

const guidePacket = document.getElementById("guidePacket");

const guideRoute = [
    { x: 70, y: 150 },
    { x: 210, y: 75 },
    { x: 390, y: 75 },
    { x: 610, y: 150 }
];

let guideRouteIndex = 0;
let guideRouteTimer = null;

function moveGuidePacket() {
    if (!guidePacket) return;

    guideRouteIndex++;

    if (guideRouteIndex >= guideRoute.length) {
        guideRouteIndex = 0;
    }

    const point = guideRoute[guideRouteIndex];

    guidePacket.setAttribute("cx", point.x);
    guidePacket.setAttribute("cy", point.y);

    guideRouteTimer = setTimeout(moveGuidePacket, 850);
}

function startGuidePacket() {
    if (!guidePacket) return;

    clearTimeout(guideRouteTimer);

    guideRouteIndex = 0;

    guidePacket.setAttribute("cx", "70");
    guidePacket.setAttribute("cy", "150");

    guideRouteTimer = setTimeout(moveGuidePacket, 850);
}

startGuidePacket();


/* Step card interaction */

const stepCards = document.querySelectorAll(".step-card");

stepCards.forEach(card => {
    card.addEventListener("click", () => {

        stepCards.forEach(item => {
            item.classList.remove("selected");
        });

        card.classList.add("selected");
    });
});


/* Mobile navigation */

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mainNav = document.querySelector(".main-nav");

if (mobileMenuBtn && mainNav) {

    mobileMenuBtn.addEventListener("click", () => {
        mainNav.classList.toggle("mobile-open");
    });

}