document.querySelectorAll('.edit-delete-button').forEach(button => {
  button.addEventListener('click', async () => {
      const albumName = button.dataset.albumName;
      const imageName = button.dataset.imageName;

      try {
          const response = await fetch(`/delete-image/${albumName}/${imageName}`, {
              method: 'DELETE'
          });
          if (response.ok) {
            // Image deleted successfully
            alert('Image deleted successfully');
            window.location.reload(true);
          } else {
            // Failed to delete image
            alert('Failed to delete image. Please try again later.');
          }
      } catch (error) {
          console.error('Error deleting image:', error);
      }
  });
});

document.addEventListener('DOMContentLoaded', function() {
    // Add event listener to all upload buttons
  const uploadButtons = document.querySelectorAll('.uploadButton');
  uploadButtons.forEach(uploadButton => {
    uploadButton.addEventListener('click', () => {
      // Find the corresponding file input and album name input
      const fileInput = uploadButton.parentElement.querySelector('.fileInput');
      const albumNameInput = uploadButton.parentElement.querySelector('.albumName');

      // Check if albumNameInput exists
      if (!albumNameInput) {
        console.error('Album name input not found');
        return;
      }

      // Trigger click event on the file input
      fileInput.click();
    });
  });
  
  const fileInputs = document.querySelectorAll('.fileInput');
  fileInputs.forEach(fileInput => {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return; // No file selected

      try {
        // Find the corresponding album name input and retrieve the value
        const albumNameInput = fileInput.parentElement.querySelector('.albumName');
        if (!albumNameInput) {
          console.error('Album name input not found');
          return;
        }
        const albumName = albumNameInput.value;

        // Resize the image before uploading
        const resizedFile = await resizeImage(file);

        // Create a FormData object to hold the resized image and album name
        const formData = new FormData();
        formData.append('image', resizedFile);
        formData.append('album', albumName);

        // Send a POST request to the server to upload the resized image
        const response = await fetch('/add-image', {
          method: 'PUT',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          const imageUrl = data.imageUrl;
          alert('Image uploaded successfully');
          window.location.reload(true);
        } else {
          console.error('Failed to upload image. Please try again later.');
        }
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    });
  });
});

// Function to resize the image using Sharp
async function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function(event) {
      const inputBuffer = event.target.result;

      // Resize the image with Sharp
      const resizedImageBuffer = await sharp(inputBuffer)
        .jpeg({ quality: 90 })// Adjust dimensions as needed
        .toBuffer();

      // Convert the resized image buffer back to a Blob
      const resizedBlob = new Blob([resizedImageBuffer], { type: file.type });

      // Create a File object from the resized Blob
      const resizedFile = new File([resizedBlob], file.name, { type: file.type });

      resolve(resizedFile);
    };
    reader.readAsArrayBuffer(file);
  });
}
