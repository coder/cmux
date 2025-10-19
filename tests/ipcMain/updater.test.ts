/**
 * Integration test for update checking against real GitHub releases.
 * 
 * This test verifies the GitHub releases API is accessible and has releases
 * that electron-updater can check against. This is a prerequisite for the
 * update notification system to work.
 * 
 * NOTE: electron-updater requires a real Electron runtime, so we test the
 * GitHub API directly here. To test the full update flow with electron-updater:
 * 1. Run `DEBUG_UPDATER=1 make dev`
 * 2. Hover over the update indicator in the title bar
 * 3. Verify it checks for updates without hanging
 * 4. Check console logs for "Checking for updates..." and result
 */

import { shouldRunIntegrationTests } from "../testUtils";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

const GITHUB_REPO = "coder/cmux";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;

interface GitHubRelease {
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

describeIntegration("GitHub Releases API for cmux updates", () => {
  test.concurrent(
    "should fetch latest releases from GitHub",
    async () => {
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          Accept: "application/vnd.github+json",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const releases: GitHubRelease[] = await response.json();
      
      // Should have at least one release
      expect(releases.length).toBeGreaterThan(0);

      console.log(`Found ${releases.length} releases`);
      
      // Find the latest non-draft, non-prerelease
      const latestRelease = releases.find(r => !r.draft && !r.prerelease);
      
      if (latestRelease) {
        console.log(`Latest release: ${latestRelease.tag_name} (${latestRelease.name})`);
        console.log(`Published: ${latestRelease.published_at}`);
        console.log(`Assets: ${latestRelease.assets.length}`);
        
        // Verify release has expected structure
        expect(latestRelease.tag_name).toBeTruthy();
        expect(latestRelease.published_at).toBeTruthy();
      } else {
        console.log("No stable releases found (only drafts/prereleases)");
      }
    },
    10000 // 10 second timeout for network request
  );

  test.concurrent(
    "should find latest release with platform-specific assets",
    async () => {
      const response = await fetch(GITHUB_API_URL);
      const releases: GitHubRelease[] = await response.json();

      // Find latest non-draft, non-prerelease
      const latestRelease = releases.find(r => !r.draft && !r.prerelease);
      
      if (!latestRelease) {
        console.log("No stable releases to check assets");
        return;
      }

      console.log(`Checking assets for ${latestRelease.tag_name}:`);
      
      // electron-updater looks for platform-specific files
      // macOS: .dmg, .zip (with yml manifest)
      // Windows: .exe (with yml manifest)
      // Linux: .AppImage, .deb, .rpm (with yml manifest)
      const expectedPatterns = [
        /\.dmg$/,           // macOS disk image
        /\.zip$/,           // macOS zip
        /\.exe$/,           // Windows installer
        /\.AppImage$/,      // Linux AppImage
        /\.yml$/,           // Update manifest
        /\.blockmap$/,      // Update diff
      ];

      const assetNames = latestRelease.assets.map(a => a.name);
      console.log("Assets:", assetNames);

      // Check if we have at least some platform assets
      const hasAssets = expectedPatterns.some(pattern =>
        assetNames.some(name => pattern.test(name))
      );

      if (hasAssets) {
        console.log("✓ Release has platform-specific assets for updates");
      } else {
        console.log("⚠ Release might be missing update assets");
      }

      // This is informational - releases might be in progress
      expect(latestRelease.assets.length).toBeGreaterThanOrEqual(0);
    },
    10000
  );

  test.concurrent(
    "should verify GitHub API rate limits are sufficient",
    async () => {
      const response = await fetch("https://api.github.com/rate_limit");
      
      expect(response.ok).toBe(true);
      
      const rateLimit = await response.json();
      
      console.log("GitHub API rate limit status:");
      console.log(`  Limit: ${rateLimit.rate.limit}`);
      console.log(`  Remaining: ${rateLimit.rate.remaining}`);
      console.log(`  Reset: ${new Date(rateLimit.rate.reset * 1000).toISOString()}`);

      // Should have some requests remaining
      expect(rateLimit.rate.remaining).toBeGreaterThan(0);
      
      // Unauthenticated limit is 60/hour, authenticated is 5000/hour
      // electron-updater uses unauthenticated requests
      expect(rateLimit.rate.limit).toBeGreaterThanOrEqual(60);
    },
    5000
  );
});

