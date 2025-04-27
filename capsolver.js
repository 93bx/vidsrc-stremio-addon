const axios = require('axios');

const CAPSOLVER_API_KEY = 'CAP-17E2EA6F8066DA238F07EEABB07F700CD6389E4A969CA846A23171473657E847';

async function createTurnstileTask(pageUrl, sitekey) {
    const response = await axios.post('https://api.capsolver.com/createTask', {
        clientKey: CAPSOLVER_API_KEY,
        task: {
            type: 'AntiTurnstileTaskProxyLess',
            websiteURL: pageUrl,
            websiteKey: sitekey
        }
    });

    if (response.data.errorId !== 0) {
        throw new Error(`CapSolver createTask failed: ${response.data.errorDescription}`);
    }

    console.log('Task Created. Task ID:', response.data.taskId);
    return response.data.taskId;
}

async function getTaskResult(taskId) {
    let attempts = 0;
    while (attempts < 20) { // up to ~60 seconds total
        await new Promise(resolve => setTimeout(resolve, 3000)); // wait 3s between tries

        const response = await axios.post('https://api.capsolver.com/getTaskResult', {
            clientKey: CAPSOLVER_API_KEY,
            taskId: taskId
        });

        if (response.data.errorId !== 0) {
            throw new Error(`CapSolver getTaskResult failed: ${response.data.errorDescription}`);
        }

        if (response.data.status === 'ready') {
            console.log('✅ CAPTCHA Solved.');
            return response.data.solution.token;
        }

        console.log('⌛ Waiting for CAPTCHA solve...');
        attempts++;
    }

    throw new Error('Timeout waiting for CAPTCHA solve.');
}

async function solveTurnstile(pageUrl, sitekey) {
    const taskId = await createTurnstileTask(pageUrl, sitekey);
    return await getTaskResult(taskId);
}

module.exports = { solveTurnstile };
