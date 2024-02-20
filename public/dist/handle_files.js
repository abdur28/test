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
        const resizedOrOriginalFile =  await resizeOrUseOriginalImage(file);

        // Create a FormData object to hold the resized image and album name
        const formData = new FormData();
        formData.append('image', resizedOrOriginalFile);
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

function resizeOrUseOriginalImage(file) {
  return new Promise((resolve, reject) => {
    // Check if file size exceeds 5.8MB (in bytes)
    const maxSize = 5.8 * 1024 * 1024; // 5.8MB in bytes
    if (file.size > maxSize) {
      // If file size exceeds 5.8MB, resize the image
      resizeImage(file).then(resizedFile => {
        resolve(resizedFile);
      }).catch(error => {
        reject(error);
      });
    } else {
      // If file size is within the limit, use the original image
      resolve(file);
    }
  });
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set canvas dimensions
        const maxWidth = 4000;
        const maxHeight = 3000;
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions while preserving aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;

        // Draw the image onto the canvas with highest quality settings
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas content back to a Blob
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error('Could not resize the image.'));
            return;
          }
          // Create a new File object from the Blob
          const resizedFile = new File([blob], file.name, { type: file.type, lastModified: Date.now() });

          // Resolve the promise with the resized File object
          resolve(resizedFile);
        }, file.type, 1); // Use quality parameter (1 = best quality)
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}
