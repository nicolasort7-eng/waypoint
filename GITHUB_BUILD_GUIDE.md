# Build Waypoint online with GitHub

This project is prepared so GitHub can build the Windows, macOS, and Linux desktop apps for you. You do not need to install Rust, Visual Studio, or Tauri locally when you use this method.

## 1. Create a GitHub account

Open <https://github.com/signup>, create an account, and verify your email address.

## 2. Create an empty repository

1. Open <https://github.com/new>.
2. Enter `waypoint` as the repository name.
3. Choose **Public** for the simplest Actions allowance, or **Private** if you do not want the source visible.
4. Do not add a README, `.gitignore`, or license on this page; those files are already included.
5. Select **Create repository**.

## 3. Upload the prepared project

1. On the empty repository page, select **uploading an existing file**.
2. Open the extracted `waypoint-github-ready` folder in File Explorer.
3. Select everything inside the folder, including `.github`, `.openai`, `app`, `desktop`, `public`, and `src-tauri`.
4. Drag the selected contents into GitHub's upload area. Upload the contents, not the enclosing folder.
5. Wait until every file is listed.
6. Enter `Add Waypoint desktop build` in the commit message.
7. Select **Commit changes**.

The `.github/workflows/build-desktop.yml` file must be present in the repository. It is what tells GitHub how to build the installers.

## 4. Run the cloud build

1. Select the repository's **Actions** tab.
2. If GitHub asks, select **I understand my workflows, go ahead and enable them**.
3. In the left sidebar, select **Build Waypoint desktop apps**.
4. Select **Run workflow** on the right.
5. Leave the branch set to `main` and select the green **Run workflow** button.
6. Refresh after a few seconds and open the new workflow run.

GitHub now builds four packages: Windows, Linux, macOS for Apple Silicon, and macOS for Intel. A first build can take several minutes.

## 5. Download the Windows app

1. Wait until **Windows installer** has a green check mark.
2. Return to the workflow run's summary page.
3. Scroll to the **Artifacts** section at the bottom.
4. Download the artifact whose name includes `Waypoint`, `windows`, and `nsis`.
5. Extract the downloaded ZIP.
6. Inside it, open the file ending in `-setup.exe`.

The app is not code-signed yet, so Windows may display an **Unknown publisher** or SmartScreen warning. Signing can be added later without changing the Waypoint interface.

## 6. Upload it to itch.io

1. Sign in to itch.io and open **Dashboard**.
2. Select **Create new project**.
3. Set the project title to **Waypoint**.
4. Set **Kind of project** to **Downloadable**.
5. Upload the Windows artifact ZIP downloaded from GitHub.
6. Mark the upload as **Windows**.
7. Add the Waypoint screenshots, description, and privacy note.
8. Save the page as a draft and download the file once yourself before publishing.

## Building a later update

1. Change the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` to the same new version.
2. Upload the changed files to GitHub and commit them.
3. Run **Build Waypoint desktop apps** again from the Actions tab.
4. Download the new artifacts and replace the old itch.io uploads.

Waypoint goal data is stored locally on each device. Encourage users to use **Backup** before installing an update and **Restore** if they need to move their data.

