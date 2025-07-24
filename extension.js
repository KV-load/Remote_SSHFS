// The module 'vscode' contains the VS Code extensibility API



const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');


/**
 * @param {vscode.ExtensionContext} context
 */


function saveConfig(context, login) {
    const configPath = vscode.Uri.joinPath(context.globalStorageUri, 'sshfs-config.json').fsPath;
   let logins = [];
    if (fs.existsSync(configPath)) {
        try {
            logins = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) {
            logins = [];
        }
    }
    if (!logins.includes(login)) {
        logins.push(login);
    }
    fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(logins, null, 2));
}

function loadconfig(context) {
    const configPath = vscode.Uri.joinPath(context.globalStorageUri, 'sshfs-config.json').fsPath;
    if (fs.existsSync(configPath)) {
        try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        catch (e) {
            console.error('Error reading sshfs-config.json:', e);
            return [];
        }
    }
    return [];
}

function activate(context) {

    const terminal = vscode.window.createTerminal('SSHFS Mount');
    terminal.show();
    let mount_dir = '';

    const disposable = vscode.commands.registerCommand('remote-sshfs.helloWorld', async function () {
        // Step 1: Ask for mount folder
        vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Open Folder'
        }).then(folder => {
            if (!folder) {
                vscode.window.showErrorMessage('No folder selected for mounting');
                return;
            }

            mount_dir = folder[0].fsPath;

            // exec('mount | grep "${mount_dir}"', (error, stdout, stderr) => {
            //     if(stdout && stdout.includes('sshfs')) {
            //         vscode.window.showErrorMessage(`The folder ${mount_dir} is already mounted.`);
            //         vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(mount_dir), {forceNewWindow: true});
            //         return;
            //     }
            // })
            const logins = loadconfig(context) || [];
            let quickPickItems = logins.map(login => ({ label: login }));
            quickPickItems.push({ label: 'Enter new login', alwaysShow: true });    
            
            vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a saved login or enter a new one'
            }).then(selected => {
                if (!selected) {
                    vscode.window.showErrorMessage('No login selected');
                    return;
                }   
                if (selected && typeof selected === 'object' && selected.label === 'Enter new login') {
                    // If the user wants to enter a new login, we will ask for it
                    vscode.window.showInputBox({prompt:'Enter username@ip_address:/'})
                        .then(value => {
                            if (!value) {
                                vscode.window.showErrorMessage('No remote entered');
                                return;
                            }
                            mountSSHFS(context, value, mount_dir);
                        });
                } else if (selected && typeof selected === 'object') {
                    // If a saved login is selected, mount using that
                    mountSSHFS(context, selected.label, mount_dir);
                } else if (typeof selected === 'string') {
                    // If selected is a string (for compatibility), use it directly
                    mountSSHFS(context, selected, mount_dir);
                }
            });
                // If there are saved logins, show a quick pick menu
        });
    });

    const unmount = vscode.window.onDidChangeWindowState((event) => {
    if (!event.focused) {
        const currentFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : null;

        if (!currentFolder) {
            return;
        }

        const command = `umount "${currentFolder}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`Auto-unmount failed: ${stderr}`);
            } else {
                vscode.window.showInformationMessage(`Auto-unmounted: ${currentFolder}`);
            }
        });
    }
});
    // Register the command and add it to the context subscriptions

    context.subscriptions.push(disposable);
    context.subscriptions.push(unmount);
}




function mountSSHFS(context, value, mount_dir) {
    const [userHost, remotePath = '/'] = value.split(':');
    const remote = `${userHost}:${remotePath}`;
    
    vscode.window.showInputBox({
        prompt: `Enter password for ${userHost}`,
        password: true,
        ignoreFocusOut: true
    }).then(password => {
        if (!password) {
            vscode.window.showErrorMessage('No password entered.');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Mounting ${value}...`,
            cancellable: false
        }, (progress) => {
            return new Promise((resolve) => {
                const sshfsArgs = [
                    '-o', 'password_stdin',
                    `${remote}`,
                    `${mount_dir}`
                ];

                const sshfsProcess = spawn('sshfs', sshfsArgs);

                sshfsProcess.stdin.write(password + '\n');
                sshfsProcess.stdin.end();

                sshfsProcess.stderr.on('data', (data) => {
                    console.error(`sshfs stderr: ${data}`);
                });

                sshfsProcess.on('close', (code) => {
                    if (code === 0) {
                        vscode.window.showInformationMessage(`Mounted: ${value}`);
                        saveConfig(context, value);
                        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(mount_dir), { forceNewWindow: true });
                    } else {
                        vscode.window.showErrorMessage(`Failed to mount ${value}. Exit code: ${code}`);
                    }
                    resolve();
                });
            });
        });
    });
}


// This method is called when your extension is deactivated
function deactivate() {
    const currentFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : null;

    if (!currentFolder) {
        vscode.window.showErrorMessage('No workspace folder is currently open.');
        return;
    }

    // Example: Unmount using terminal
    const command = `umount "${currentFolder}"`;
    exec(command, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`Unmount failed: ${stderr}`);
            return;
        }
        vscode.window.showInformationMessage(`Unmounted: ${currentFolder}`);
    });
    vscode.window.showInformationMessage(`Unmounting: ${currentFolder}`);
}

module.exports = {
    activate,
    deactivate
}
