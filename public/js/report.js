/**
 * Lokrun – A Citizen Civic-Infrastructure Reporting Platform
 * Client-side Reporting Controller (public/js/report.js)
 * Vanilla JavaScript (Zero external dependencies)
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('report-form');
  if (!form) return;

  // Elements
  const formCard = document.getElementById('report-form-card');
  const successCard = document.getElementById('report-success-card');
  const submitBtn = document.getElementById('submit-btn');
  const formAlert = document.getElementById('form-alert');

  // Input fields
  const titleInput = document.getElementById('report-title');
  const descInput = document.getElementById('report-desc');
  const landmarkInput = document.getElementById('report-landmark');
  const btnDetectLocation = document.getElementById('btn-detect-location');
  const locationStatus = document.getElementById('location-status');
  const imageInput = document.getElementById('report-image');
  const imageUploadZone = document.getElementById('image-upload-zone');
  const imagePreviewWrapper = document.getElementById('image-preview-wrapper');
  const imagePreviewImg = document.getElementById('image-preview-img');
  const btnRemoveImage = document.getElementById('btn-remove-image');
  const imageFileNameDisplay = document.getElementById('image-file-name');

  const contactNameInput = document.getElementById('contact-name');
  const contactPhoneInput = document.getElementById('contact-phone');
  const contactEmailInput = document.getElementById('contact-email');
  const consentCheckbox = document.getElementById('consent-checkbox');

  // Success screen elements
  const successRefId = document.getElementById('success-ref-id');
  const btnCopyId = document.getElementById('btn-copy-id');
  const copyFeedback = document.getElementById('copy-feedback');
  const linkTrackReport = document.getElementById('link-track-report');
  const btnNewReport = document.getElementById('btn-new-report');

  // Inline error elements
  const errorCategory = document.getElementById('error-category');
  const errorTitle = document.getElementById('error-title');
  const errorDesc = document.getElementById('error-desc');
  const errorLandmark = document.getElementById('error-landmark');
  const errorImage = document.getElementById('error-image');
  const errorContactEmail = document.getElementById('error-contact-email');
  const errorConsent = document.getElementById('error-consent');

  // State
  // Only real browser-detected coordinates are saved; null by default
  let currentCoordinates = null;

  let imageBase64 = null;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

  // --- Helper: Clear All Inline Errors ---
  function clearErrors() {
    formAlert.classList.remove('active');
    formAlert.textContent = '';
    const errorSpans = document.querySelectorAll('.inline-error');
    errorSpans.forEach(span => {
      span.classList.remove('active');
      span.textContent = '';
    });
  }

  function showError(element, message) {
    if (element) {
      element.textContent = message;
      element.classList.add('active');
    }
  }

  function showFormAlert(message) {
    formAlert.textContent = message;
    formAlert.classList.add('active');
    formAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // --- Geolocation: Detect My Location ---
  if (btnDetectLocation) {
    btnDetectLocation.addEventListener('click', () => {
      if (!('geolocation' in navigator)) {
        locationStatus.className = 'location-status active warning';
        locationStatus.textContent = 'Geolocation is not supported by your browser. Please enter your location or landmark manually below.';
        currentCoordinates = null;
        return;
      }

      locationStatus.className = 'location-status active info';
      locationStatus.textContent = 'Detecting current GPS coordinates...';
      btnDetectLocation.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = parseFloat(position.coords.latitude.toFixed(6));
          const lng = parseFloat(position.coords.longitude.toFixed(6));
          currentCoordinates = { lat, lng };

          locationStatus.className = 'location-status active success';
          locationStatus.textContent = `Live GPS detected: ${lat}, ${lng} (Accuracy: ~${Math.round(position.coords.accuracy)}m)`;
          btnDetectLocation.disabled = false;
        },
        (error) => {
          btnDetectLocation.disabled = false;
          currentCoordinates = null;
          locationStatus.className = 'location-status active warning';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              locationStatus.textContent = 'Location access was denied. Please enter your landmark or address manually below.';
              break;
            case error.POSITION_UNAVAILABLE:
              locationStatus.textContent = 'Location position unavailable. Please enter your landmark or address manually below.';
              break;
            case error.TIMEOUT:
              locationStatus.textContent = 'Location request timed out. Please enter your landmark or address manually below.';
              break;
            default:
              locationStatus.textContent = 'Could not detect location. Please enter your landmark or address manually below.';
              break;
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // --- Image Handling & Base64 Conversion ---
  if (imageUploadZone && imageInput) {
    imageUploadZone.addEventListener('click', (e) => {
      if (e.target !== btnRemoveImage) {
        imageInput.click();
      }
    });

    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleFileSelected(file);
    });
  }

  if (btnRemoveImage) {
    btnRemoveImage.addEventListener('click', (e) => {
      e.stopPropagation();
      resetImage();
    });
  }

  function resetImage() {
    imageInput.value = '';
    imageBase64 = null;
    imagePreviewImg.src = '';
    imagePreviewWrapper.classList.remove('active');
    imageUploadZone.style.display = 'block';
    if (imageFileNameDisplay) imageFileNameDisplay.textContent = '';
    errorImage.classList.remove('active');
    errorImage.textContent = '';
  }

  function handleFileSelected(file) {
    if (!file) return;

    errorImage.classList.remove('active');
    errorImage.textContent = '';

    // Check size (5 MB limit)
    if (file.size > MAX_IMAGE_BYTES) {
      showError(errorImage, `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 5 MB limit.`);
      imageInput.value = '';
      return;
    }

    // Check MIME type / extension
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') || fileName.endsWith('.webp');

    if (!validMimes.includes(file.type) && !hasValidExt) {
      showError(errorImage, 'Invalid image format. Supported formats: JPG, PNG, WEBP.');
      imageInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      imageBase64 = event.target.result;
      imagePreviewImg.src = imageBase64;
      imagePreviewWrapper.classList.add('active');
      imageUploadZone.style.display = 'none';
      if (imageFileNameDisplay) {
        imageFileNameDisplay.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
    };
    reader.onerror = () => {
      showError(errorImage, 'Failed to read image file.');
      resetImage();
    };
    reader.readAsDataURL(file);
  }

  // --- Form Submission & Validation ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    let hasClientErrors = false;

    // 1. Category validation
    const selectedCategoryRadio = document.querySelector('input[name="category"]:checked');
    if (!selectedCategoryRadio) {
      showError(errorCategory, 'Please select an issue category.');
      hasClientErrors = true;
    }
    const category = selectedCategoryRadio ? selectedCategoryRadio.value : '';

    // 2. Title validation (3-120 chars)
    const title = titleInput.value.trim();
    if (!title || title.length < 3 || title.length > 120) {
      showError(errorTitle, 'Title must be between 3 and 120 characters.');
      hasClientErrors = true;
    }

    // 3. Description validation (5-2000 chars)
    const description = descInput.value.trim();
    if (!description || description.length < 5 || description.length > 2000) {
      showError(errorDesc, 'Description must be between 5 and 2000 characters.');
      hasClientErrors = true;
    }

    // 4. Landmark validation (2-150 chars)
    const landmark = landmarkInput.value.trim();
    if (!landmark || landmark.length < 2 || landmark.length > 150) {
      showError(errorLandmark, 'Location or landmark must be between 2 and 150 characters.');
      hasClientErrors = true;
    }

    // 5. Contact Email format if provided
    const contactEmail = contactEmailInput.value.trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      showError(errorContactEmail, 'Please enter a valid email address or leave blank.');
      hasClientErrors = true;
    }

    // 6. Privacy Consent
    if (!consentCheckbox.checked) {
      showError(errorConsent, 'You must acknowledge the privacy notice to submit a report.');
      hasClientErrors = true;
    }

    if (hasClientErrors) {
      showFormAlert('Please resolve the highlighted errors before submitting.');
      return;
    }

    // Construct Payload exactly matching server.js schema
    const payload = {
      title,
      category,
      description,
      landmark,
      lat: currentCoordinates ? currentCoordinates.lat : null,
      lng: currentCoordinates ? currentCoordinates.lng : null,
      contact: {
        name: contactNameInput.value.trim() || null,
        phone: contactPhoneInput.value.trim() || null,
        email: contactEmail || null
      }
    };

    if (imageBase64) {
      payload.image = imageBase64;
    }

    // Submit via fetch to /api/reports
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting report...';

      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details && Array.isArray(data.details)) {
          showFormAlert(`Submission failed: ${data.details.join(', ')}`);
        } else {
          showFormAlert(data.error || 'Failed to submit report. Please try again.');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Civic Report';
        return;
      }

      // Success Display (strictly using textContent to prevent XSS)
      const reportId = data.report.id;
      successRefId.textContent = reportId;
      linkTrackReport.href = `/track.html?id=${encodeURIComponent(reportId)}`;

      formCard.classList.add('hidden');
      successCard.classList.add('active');
      successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (netErr) {
      showFormAlert('Network error: Unable to reach Lokrun server. Ensure backend is running.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Civic Report';
    }
  });

  // --- Copy Reference ID ---
  if (btnCopyId) {
    btnCopyId.addEventListener('click', async () => {
      const idText = successRefId.textContent.trim();
      if (!idText) return;
      try {
        await navigator.clipboard.writeText(idText);
        copyFeedback.textContent = 'Copied to clipboard!';
        setTimeout(() => {
          copyFeedback.textContent = '';
        }, 2500);
      } catch (err) {
        // Fallback for older browsers
        const tempInput = document.createElement('input');
        tempInput.value = idText;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        copyFeedback.textContent = 'Copied!';
        setTimeout(() => {
          copyFeedback.textContent = '';
        }, 2500);
      }
    });
  }

  // --- Submit Another Report Reset ---
  if (btnNewReport) {
    btnNewReport.addEventListener('click', () => {
      form.reset();
      resetImage();
      clearErrors();
      currentCoordinates = null;
      locationStatus.className = 'location-status';
      locationStatus.textContent = '';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Civic Report';

      successCard.classList.remove('active');
      formCard.classList.remove('hidden');
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
});
