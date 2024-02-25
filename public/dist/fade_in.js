// This function gradually fades in the photos after DOMContentLoaded
document.addEventListener("DOMContentLoaded", function () {
  const body = document.querySelector("body");
  body.classList.remove("opacity-0");
  body.classList.add("opacity-100");
  
  // Gradually fade in each photo with a delay
  const photos = document.querySelectorAll('img');
  let delay = 0;
  photos.forEach((photo) => {
      setTimeout(() => {
          photo.classList.remove("opacity-0");
          photo.classList.add("opacity-100");
      }, delay);
      delay += 400; // Increment delay for each photo
  });
  
});

// Function to check if an element is in the viewport
function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Function to handle scroll event
function handleScroll() {
  const sections = document.querySelectorAll('.sliding-section');
  sections.forEach(section => {
    if (isInViewport(section)) {
      section.classList.add('in-view');
    }
  });
}

// Add scroll event listener
window.addEventListener('scroll', handleScroll);

// Initial check on page load
handleScroll();
