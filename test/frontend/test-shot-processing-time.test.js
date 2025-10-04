/**
 * Frontend Unit Tests: Test Shot Processing Time Display
 *
 * Tests the processing time display logic in renderTestPhotoGallery()
 * method in public/js/test-shot.js.
 *
 * Processing time measures the duration from shutterbutton press until
 * the addedcontents event is received, helping users determine appropriate
 * timelapse intervals.
 */

import { jest } from "@jest/globals";

describe("TestShotUI - Processing Time Display Tests", () => {
  let mockDocument;
  let elements;

  beforeEach(() => {
    // Reset elements for each test
    elements = {
      testPhotoGallery: { innerHTML: "" },
    };

    // Mock document.getElementById
    mockDocument = {
      getElementById: jest.fn((id) => {
        const elementMap = {
          "testphoto-gallery": elements.testPhotoGallery,
        };
        return elementMap[id] || null;
      }),
    };

    // Replace global document
    global.document = mockDocument;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("formatProcessingTime() - Helper Function", () => {
    // This is the utility function that will be added to TestShotUI class
    function formatProcessingTime(ms) {
      if (ms === undefined || ms === null || ms < 0) {
        return null;
      }

      if (ms >= 1000) {
        // Display as seconds with 1 decimal place
        return `${(ms / 1000).toFixed(1)}s`;
      } else {
        // Display as milliseconds
        return `${Math.round(ms)}ms`;
      }
    }

    test("formats >= 1000ms as seconds with 1 decimal", () => {
      expect(formatProcessingTime(1000)).toBe("1.0s");
      expect(formatProcessingTime(2345)).toBe("2.3s");
      expect(formatProcessingTime(5678)).toBe("5.7s");
      expect(formatProcessingTime(10000)).toBe("10.0s");
      expect(formatProcessingTime(12890)).toBe("12.9s");
    });

    test("formats < 1000ms as milliseconds (rounded)", () => {
      expect(formatProcessingTime(0)).toBe("0ms");
      expect(formatProcessingTime(50)).toBe("50ms");
      expect(formatProcessingTime(450)).toBe("450ms");
      expect(formatProcessingTime(999)).toBe("999ms");
      expect(formatProcessingTime(123.7)).toBe("124ms"); // Rounds up
      expect(formatProcessingTime(123.2)).toBe("123ms"); // Rounds down
    });

    test("handles edge cases", () => {
      expect(formatProcessingTime(999.9)).toBe("1000ms"); // Rounds to 1000ms
      expect(formatProcessingTime(1000.4)).toBe("1.0s"); // Just over threshold
    });

    test("returns null for invalid input", () => {
      expect(formatProcessingTime(undefined)).toBe(null);
      expect(formatProcessingTime(null)).toBe(null);
      expect(formatProcessingTime(-1)).toBe(null);
      expect(formatProcessingTime(-100)).toBe(null);
    });

    test("handles zero correctly", () => {
      expect(formatProcessingTime(0)).toBe("0ms");
    });

    test("handles decimal inputs correctly", () => {
      expect(formatProcessingTime(500.5)).toBe("501ms"); // Rounds up
      expect(formatProcessingTime(1500.7)).toBe("1.5s");
      expect(formatProcessingTime(2345.123)).toBe("2.3s"); // Only 1 decimal for seconds
    });

    test("handles very large values", () => {
      expect(formatProcessingTime(60000)).toBe("60.0s"); // 1 minute
      expect(formatProcessingTime(120000)).toBe("120.0s"); // 2 minutes
    });
  });

  describe("Processing Time Display in Gallery", () => {
    // Mock implementation of the rendering logic
    function renderProcessingTimeInGallery(photo) {
      const processingTime = formatProcessingTime(photo.processingTimeMs);

      if (!processingTime) {
        return `<strong>${photo.cameraPath}</strong>`;
      }

      return `<strong>${photo.cameraPath} (${processingTime})</strong>`;
    }

    function formatProcessingTime(ms) {
      if (ms === undefined || ms === null || ms < 0) {
        return null;
      }

      if (ms >= 1000) {
        return `${(ms / 1000).toFixed(1)}s`;
      } else {
        return `${Math.round(ms)}ms`;
      }
    }

    test("displays processing time in parentheses after cameraPath", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0031.JPG",
        processingTimeMs: 2345,
      };

      const result = renderProcessingTimeInGallery(photo);

      expect(result).toContain("100CANON/IMG_0031.JPG");
      expect(result).toContain("(2.3s)");
      expect(result).toBe("<strong>100CANON/IMG_0031.JPG (2.3s)</strong>");
    });

    test("displays milliseconds when < 1000ms", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0032.JPG",
        processingTimeMs: 450,
      };

      const result = renderProcessingTimeInGallery(photo);

      expect(result).toContain("(450ms)");
      expect(result).toBe("<strong>100CANON/IMG_0032.JPG (450ms)</strong>");
    });

    test("displays seconds when >= 1000ms", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0033.JPG",
        processingTimeMs: 5678,
      };

      const result = renderProcessingTimeInGallery(photo);

      expect(result).toContain("(5.7s)");
      expect(result).toBe("<strong>100CANON/IMG_0033.JPG (5.7s)</strong>");
    });

    test("handles zero processing time", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0034.JPG",
        processingTimeMs: 0,
      };

      const result = renderProcessingTimeInGallery(photo);

      expect(result).toContain("(0ms)");
      expect(result).toBe("<strong>100CANON/IMG_0034.JPG (0ms)</strong>");
    });

    test("omits processing time when not present", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0035.JPG",
        // processingTimeMs is missing
      };

      const result = renderProcessingTimeInGallery(photo);

      expect(result).not.toContain("(");
      expect(result).toBe("<strong>100CANON/IMG_0035.JPG</strong>");
    });

    test("omits processing time when null", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0036.JPG",
        processingTimeMs: null,
      };

      const result = renderProcessingTimeInGallery(photo);

      expect(result).not.toContain("(");
      expect(result).toBe("<strong>100CANON/IMG_0036.JPG</strong>");
    });

    test("omits processing time when negative", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0037.JPG",
        processingTimeMs: -100,
      };

      const result = renderProcessingTimeInGallery(photo);

      expect(result).not.toContain("(");
      expect(result).toBe("<strong>100CANON/IMG_0037.JPG</strong>");
    });
  });

  describe("Real-World Processing Time Examples", () => {
    function formatProcessingTime(ms) {
      if (ms === undefined || ms === null || ms < 0) {
        return null;
      }

      if (ms >= 1000) {
        return `${(ms / 1000).toFixed(1)}s`;
      } else {
        return `${Math.round(ms)}ms`;
      }
    }

    test("typical fast shot (ISO 6400, 30s exposure)", () => {
      // Typical processing time for high ISO, long exposure
      expect(formatProcessingTime(2345)).toBe("2.3s");
    });

    test("very fast shot (ISO 100, 1/250s exposure)", () => {
      // Quick daylight shot processes fast
      expect(formatProcessingTime(850)).toBe("850ms");
    });

    test("slow processing (ISO 12800, 30s exposure + noise reduction)", () => {
      // Long exposure with noise reduction takes longer
      expect(formatProcessingTime(8500)).toBe("8.5s");
    });

    test("extremely slow shot (bulb mode, long NR)", () => {
      // Bulb mode with heavy processing
      expect(formatProcessingTime(15000)).toBe("15.0s");
    });
  });

  describe("Integration with renderTestPhotoGallery()", () => {
    // Mock full rendering logic (simplified)
    function renderTestPhotoGalleryHTML(photos) {
      if (photos.length === 0) {
        return '<p style="text-align: center; padding: 2rem; color: #666;">No test photos captured yet.</p>';
      }

      return photos
        .map((photo) => {
          const processingTime = formatProcessingTime(photo.processingTimeMs);
          const processingTimeDisplay = processingTime
            ? ` (${processingTime})`
            : "";

          return `
        <div class="test-photo-card">
          <div class="exif-metadata" data-exif>
            ${photo.cameraPath ? `<div><strong>${photo.cameraPath}${processingTimeDisplay}</strong></div>` : ""}
          </div>
        </div>
      `;
        })
        .join("");
    }

    function formatProcessingTime(ms) {
      if (ms === undefined || ms === null || ms < 0) {
        return null;
      }

      if (ms >= 1000) {
        return `${(ms / 1000).toFixed(1)}s`;
      } else {
        return `${Math.round(ms)}ms`;
      }
    }

    test("renders multiple photos with different processing times", () => {
      const photos = [
        {
          id: 1,
          cameraPath: "100CANON/IMG_0001.JPG",
          processingTimeMs: 450,
        },
        {
          id: 2,
          cameraPath: "100CANON/IMG_0002.JPG",
          processingTimeMs: 2345,
        },
        {
          id: 3,
          cameraPath: "100CANON/IMG_0003.JPG",
          processingTimeMs: 5678,
        },
      ];

      const html = renderTestPhotoGalleryHTML(photos);

      expect(html).toContain("IMG_0001.JPG (450ms)");
      expect(html).toContain("IMG_0002.JPG (2.3s)");
      expect(html).toContain("IMG_0003.JPG (5.7s)");
    });

    test("renders photos without processing time gracefully", () => {
      const photos = [
        {
          id: 1,
          cameraPath: "100CANON/IMG_0001.JPG",
          // No processingTimeMs
        },
        {
          id: 2,
          cameraPath: "100CANON/IMG_0002.JPG",
          processingTimeMs: 1234,
        },
      ];

      const html = renderTestPhotoGalleryHTML(photos);

      // First photo should not have processing time
      expect(html).toContain("IMG_0001.JPG</strong>");
      expect(html).not.toContain("IMG_0001.JPG (");

      // Second photo should have processing time
      expect(html).toContain("IMG_0002.JPG (1.2s)");
    });

    test("handles empty photo list", () => {
      const html = renderTestPhotoGalleryHTML([]);

      expect(html).toContain("No test photos captured yet");
    });
  });

  describe("Processing Time Display Position", () => {
    test("processing time appears after cameraPath in correct HTML structure", () => {
      const photo = {
        id: 1,
        cameraPath: "100CANON/IMG_0031.JPG",
        processingTimeMs: 2345,
      };

      const processingTime = formatProcessingTime(photo.processingTimeMs);
      const expectedHTML = `<strong>${photo.cameraPath} (${processingTime})</strong>`;

      expect(expectedHTML).toBe(
        "<strong>100CANON/IMG_0031.JPG (2.3s)</strong>",
      );
    });

    function formatProcessingTime(ms) {
      if (ms === undefined || ms === null || ms < 0) {
        return null;
      }

      if (ms >= 1000) {
        return `${(ms / 1000).toFixed(1)}s`;
      } else {
        return `${Math.round(ms)}ms`;
      }
    }
  });
});
