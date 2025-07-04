document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('imageUpload');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const imageCanvas = document.getElementById('imageCanvas');
    const ctx = imageCanvas.getContext('2d');
    const addWellBtn = document.getElementById('addWellBtn');
    const clearWellsBtn = document.getElementById('clearWellsBtn');

    // Elementos para o cálculo manual
    const redInput = document.getElementById('red');
    const greenInput = document.getElementById('green');
    const blueInput = document.getElementById('blue');
    const colorPreview = document.querySelector('.color-preview');
    const calculateBtn = document.getElementById('calculateBtn');
    const fcManualResultSpan = document.getElementById('fcManualResult');
    const reductionManualResultSpan = document.getElementById('reductionManualResult');

    // Elementos para os resultados de múltiplos poços
    const wellsResultsContainer = document.getElementById('wellsResultsContainer');
    const noWellsMessage = document.getElementById('noWellsMessage');
    const calculateAverageBtn = document.getElementById('calculateAverageBtn');
    const averageFcResultSpan = document.getElementById('averageFcResult');
    const averageReductionResultSpan = document.getElementById('averageReductionResult');

    // Elementos da seção de interpolação
    const red1PercentInput = document.getElementById('red1Percent');
    const fc1ValueInput = document.getElementById('fc1Value');
    const red2PercentInput = document.getElementById('red2Percent');
    const fc2ValueInput = document.getElementById('fc2Value');
    const saveInterpolationBtn = document.getElementById('saveInterpolationBtn');
    const interpolationSaveMessage = document.getElementById('interpolationSaveMessage');
    const currentConfigDisplay = document.querySelector('.current-config-display');

    // Variáveis que armazenarão os pontos de calibração ATUAIS (dinâmicos)
    let currentRed1 = parseFloat(red1PercentInput.value);
    let currentFc1 = parseFloat(fc1ValueInput.value);
    let currentRed2 = parseFloat(red2PercentInput.value);
    let currentFc2 = parseFloat(fc2ValueInput.value);
    let slope = (currentRed2 - currentRed1) / (currentFc2 - currentFc1);

    let currentImage = null;
    let sampleSize = 10; // Valor padrão, será sobrescrito pelo askForSampleSize()
    let lastExtractedR = null;
    let lastExtractedG = null;
    let lastExtractedB = null;

    let selectedWells = []; // Array para armazenar os dados de cada poço selecionado

    // --- Funções para Gerenciar a Calibração ---

    function updateInterpolationParameters() {
        currentRed1 = parseFloat(red1PercentInput.value);
        currentFc1 = parseFloat(fc1ValueInput.value);
        currentRed2 = parseFloat(red2PercentInput.value);
        currentFc2 = parseFloat(fc2ValueInput.value);

        if (isNaN(currentRed1) || isNaN(currentFc1) || isNaN(currentRed2) || isNaN(currentFc2) ||
            currentRed1 < 0 || currentRed1 > 100 || currentRed2 < 0 || currentRed2 > 100 ||
            currentFc1 <= 0 || currentFc2 <= 0) {
            interpolationSaveMessage.textContent = 'Erro: Verifique os valores de % Redução (0-100) e Fator de Cor (>0).';
            interpolationSaveMessage.style.color = 'red';
            return false;
        }

        if (currentFc1 === currentFc2) {
            interpolationSaveMessage.textContent = 'Erro: Os Fatores de Cor dos dois pontos não podem ser iguais (divisão por zero).';
            interpolationSaveMessage.style.color = 'red';
            return false;
        }

        slope = (currentRed2 - currentRed1) / (currentFc2 - currentFc1);
        interpolationSaveMessage.textContent = 'Padrões de interpolação salvos com sucesso!';
        interpolationSaveMessage.style.color = '#28a745';
        currentConfigDisplay.textContent = `Padrões Atuais: Ponto 1 (${currentRed1.toFixed(2)}%, FC ${currentFc1.toFixed(4)}) e Ponto 2 (${currentRed2.toFixed(2)}%, FC ${currentFc2.toFixed(4)})`;
        
        // Opcional: Salvar no localStorage
        localStorage.setItem('calibrationPoints', JSON.stringify({
            point1: { percentReduction: currentRed1, fc: currentFc1 },
            point2: { percentReduction: currentRed2, fc: currentFc2 }
        }));
        
        // Limpa a mensagem após alguns segundos
        setTimeout(() => {
            interpolationSaveMessage.textContent = '';
        }, 3000);

        return true;
    }

    // Carrega os pontos de calibração do localStorage ao iniciar
    function loadInterpolationParameters() {
        const savedPoints = localStorage.getItem('calibrationPoints');
        if (savedPoints) {
            const parsedPoints = JSON.parse(savedPoints);
            red1PercentInput.value = parsedPoints.point1.percentReduction;
            fc1ValueInput.value = parsedPoints.point1.fc;
            red2PercentInput.value = parsedPoints.point2.percentReduction;
            fc2ValueInput.value = parsedPoints.point2.fc;
        }
        updateInterpolationParameters(); // Garante que as variáveis globais e o display estejam atualizados
    }


    // --- Pergunta o tamanho da área de amostragem ao abrir ---
    function askForSampleSize() {
        let inputIsValid = false;
        while (!inputIsValid) {
            const sizeInput = prompt("Digite o tamanho da área de amostragem de pixels (ex: 5 para 5x5, 10 para 10x10). Deve ser um número inteiro positivo:", localStorage.getItem('sampleSize') || "10");

            if (sizeInput === null) {
                alert("Nenhum tamanho de amostra foi definido. Usando o padrão de 10x10 pixels.");
                sampleSize = 10;
                inputIsValid = true;
            } else {
                const parsedSize = parseInt(sizeInput);
                if (!isNaN(parsedSize) && parsedSize > 0 && Number.isInteger(parsedSize)) {
                    sampleSize = parsedSize;
                    localStorage.setItem('sampleSize', sampleSize); // Salva no localStorage
                    alert(`Área de amostragem definida para ${sampleSize}x${sampleSize} pixels.`);
                    inputIsValid = true;
                } else {
                    alert("Entrada inválida. Por favor, digite um número inteiro positivo.");
                }
            }
        }
    }

    // --- Funções de Cálculo (refatoradas para serem reutilizáveis) ---

    function calculateResults(R, G, B) {
        // Não chamamos updateInterpolationParameters aqui para evitar loops ou mensagens indesejadas
        // Os valores currentRed1, currentFc1, etc., devem estar atualizados antes desta chamada.
        // Já fazemos isso no addWellToList e no calculateBtn clique.

        if (isNaN(R) || isNaN(G) || isNaN(B) || R < 0 || R > 255 || G < 0 || G > 255 || B < 0 || B > 255) {
            return { FC: 'RGB Inválido', Reduction: 'RGB Inválido', valid: false };
        }

        if (R === 0) {
            return { FC: 'Indefinido (R=0)', Reduction: 'Fórmula não aplicável', valid: false };
        }

        const FC = (R + G + B) / R;
        let percentReductionBrute = currentRed1 + (FC - currentFc1) * slope;

        let percentReductionFinal;
        if (percentReductionBrute > 100) {
            percentReductionFinal = 100;
        } else if (percentReductionBrute < 0) {
            percentReductionFinal = 0;
        } else {
            percentReductionFinal = percentReductionBrute;
        }

        return {
            FC: FC.toFixed(4),
            Reduction: percentReductionFinal.toFixed(2),
            valid: true
        };
    }

    // --- Funções para Manuseio de Poços Múltiplos ---

    function addWellToList(R, G, B) {
        if (R === null || G === null || B === null) {
            alert('Nenhum RGB extraído para adicionar. Clique na imagem primeiro para extrair a cor do poço.');
            return;
        }
        
        // Garante que os parâmetros de interpolação estão atualizados
        if (!updateInterpolationParameters()) {
             // Se houver erro na interpolação, não adiciona o poço e exibe a mensagem de erro
            return; 
        }

        noWellsMessage.style.display = 'none';

        const wellId = selectedWells.length + 1; // Ajusta ID para ser sequencial após a filtragem
        const results = calculateResults(R, G, B);

        const wellData = {
            id: wellId,
            R: R,
            G: G,
            B: B,
            FC: results.FC,
            Reduction: results.Reduction,
            isValid: results.valid
        };
        selectedWells.push(wellData);

        // Não chama displayWellResult individualmente, a renderWells vai cuidar de tudo
        renderWells(); 
        resetLastExtractedRGB();
        updateColorPreview();
    }
    
    // Função para renderizar TODOS os poços, incluindo a esfera
    function renderWells() {
        wellsResultsContainer.innerHTML = ''; // Limpa o container antes de adicionar
        if (selectedWells.length === 0) {
            noWellsMessage.style.display = 'block';
            return;
        }
        noWellsMessage.style.display = 'none'; // Esconde a mensagem se há poços

        selectedWells.forEach((wellData, index) => {
            // Reajusta o ID para exibição (não muda o ID no array selectedWells)
            wellData.id = index + 1; 

            const wellCard = document.createElement('div');
            wellCard.className = 'well-card';
            wellCard.dataset.wellId = wellData.id;

            const fcColor = wellData.isValid ? '#007bff' : 'red';
            const reductionColor = wellData.isValid ? '#007bff' : 'red';

            wellCard.innerHTML = `
                <h3>Poço ${wellData.id} <button class="close-btn" data-id="${wellData.id}">×</button></h3>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 20px; height: 20px; background-color: rgb(${wellData.R},${wellData.G},${wellData.B}); border-radius: 50%; border: 1px solid #ccc;"></div>
                    <div>
                        <p><strong>RGB:</strong> R${wellData.R} G${wellData.G} B${wellData.B}</p>
                        <p><strong>FC:</strong> <span style="color:${fcColor};">${wellData.FC}</span></p>
                        <p><strong>% Redução:</strong> <span style="color:${reductionColor};">${wellData.Reduction}</span></p>
                    </div>
                </div>
            `;
            wellsResultsContainer.appendChild(wellCard);

            wellCard.querySelector('.close-btn').addEventListener('click', removeWell);
        });
    }

    function removeWell(event) {
        const idToRemove = parseInt(event.target.dataset.id);
        // Filtra o array, removendo o poço com o ID correspondente
        selectedWells = selectedWells.filter(well => well.id !== idToRemove);
        
        // Re-renderiza todos os poços para atualizar os IDs e a interface
        renderWells();

        if (selectedWells.length === 0) {
            noWellsMessage.style.display = 'block';
        }
        calculateAverage();
    }

    function clearAllWells() {
        if (confirm('Tem certeza que deseja limpar todos os poços adicionados?')) {
            selectedWells = [];
            renderWells(); // Usa renderWells para limpar a exibição
            noWellsMessage.style.display = 'block';
            averageFcResultSpan.textContent = 'Aguardando cálculo...';
            averageReductionResultSpan.textContent = 'Aguardando cálculo...';
            resetLastExtractedRGB();
            updateColorPreview();
        }
    }

    function calculateAverage() {
        if (selectedWells.length === 0) {
            averageFcResultSpan.textContent = 'N/A';
            averageReductionResultSpan.textContent = 'N/A';
            return;
        }

        let totalFC = 0;
        let totalReduction = 0;
        let validWellsCount = 0;

        selectedWells.forEach(well => {
            if (well.isValid && !isNaN(parseFloat(well.FC)) && !isNaN(parseFloat(well.Reduction))) {
                totalFC += parseFloat(well.FC);
                totalReduction += parseFloat(well.Reduction);
                validWellsCount++;
            }
        });

        if (validWellsCount > 0) {
            averageFcResultSpan.textContent = (totalFC / validWellsCount).toFixed(4);
            averageReductionResultSpan.textContent = `${(totalReduction / validWellsCount).toFixed(2)}%`;
        } else {
            averageFcResultSpan.textContent = 'N/A (nenhum poço válido)';
            averageReductionResultSpan.textContent = 'N/A (nenhum poço válido)';
        }
    }

    function resetLastExtractedRGB() {
        lastExtractedR = 0;
        lastExtractedG = 0;
        lastExtractedB = 0;
        redInput.value = 0;
        greenInput.value = 0;
        blueInput.value = 0;
    }

    // --- Funções de Preview de Cor ---
    function updateColorPreview() {
        const r = parseInt(redInput.value);
        const g = parseInt(greenInput.value);
        const b = parseInt(blueInput.value);

        if (!isNaN(r) && !isNaN(g) && !isNaN(b) && r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
            colorPreview.style.backgroundColor = `rgb(${r},${g},${b})`;
        } else {
            colorPreview.style.backgroundColor = 'rgb(0,0,0)'; // Cor padrão se os valores forem inválidos
        }
    }


    // --- Event Listeners ---

    askForSampleSize(); // Pergunta o tamanho da amostra ao carregar
    loadInterpolationParameters(); // Carrega e inicializa os parâmetros de interpolação
    renderWells(); // Renderiza quaisquer poços que possam ter sido restaurados (se você implementar persistência)


    imageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            fileNameDisplay.textContent = file.name;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    currentImage = img;
                    // Ajusta o tamanho do canvas para a imagem, mantendo a proporção
                    const parentWidth = imageCanvas.parentElement.offsetWidth - 100; // Ajusta para a prévia de cor
                    const maxHeight = 400;

                    let width = img.width;
                    let height = img.height;

                    if (width > parentWidth) {
                        height = height * (parentWidth / width);
                        width = parentWidth;
                    }
                    if (height > maxHeight) {
                        width = width * (maxHeight / height);
                        height = maxHeight;
                    }
                    
                    imageCanvas.width = width;
                    imageCanvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    resetLastExtractedRGB();
                    updateColorPreview();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            fileNameDisplay.textContent = 'Nenhuma imagem selecionada.';
            ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
            currentImage = null;
            imageCanvas.width = 0; // Redefine o tamanho do canvas
            imageCanvas.height = 0;
            resetLastExtractedRGB();
            updateColorPreview();
        }
    });

    imageCanvas.addEventListener('click', (event) => {
        if (!currentImage) {
            alert('Por favor, carregue uma imagem primeiro para extrair o RGB.');
            return;
        }

        // Redesenha a imagem para limpar o marcador anterior
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(currentImage, 0, 0, imageCanvas.width, imageCanvas.height);

        const rect = imageCanvas.getBoundingClientRect(); // Obtém o tamanho e posição do canvas na tela
        const scaleX = imageCanvas.width / rect.width;    // Fator de escala X (pixel do canvas / pixel da tela)
        const scaleY = imageCanvas.height / rect.height;  // Fator de escala Y

        // Calcula a posição do clique em relação ao canvas original (não ao tamanho exibido na tela)
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        const halfSampleSize = Math.floor(sampleSize / 2);

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let pixelCount = 0;

        // Loop para pegar a média dos pixels na área de amostragem
        for (let i = -halfSampleSize; i <= halfSampleSize; i++) {
            for (let j = -halfSampleSize; j <= halfSampleSize; j++) {
                const sampleX = Math.max(0, Math.min(imageCanvas.width - 1, Math.round(x + i))); // Arredonda para inteiro mais próximo
                const sampleY = Math.max(0, Math.min(imageCanvas.height - 1, Math.round(y + j))); // Arredonda para inteiro mais próximo

                try {
                    // getImageData pode falhar se a imagem tiver problemas de CORS (carregada de outra origem)
                    const pixelData = ctx.getImageData(sampleX, sampleY, 1, 1).data;

                    // Verifica se os dados do pixel são válidos (alguns navegadores podem retornar 0,0,0,0)
                    if (pixelData[3] > 0 || pixelData[0] !== 0 || pixelData[1] !== 0 || pixelData[2] !== 0) { // Se não for totalmente transparente e não for preto puro (pode ser background)
                        totalR += pixelData[0];
                        totalG += pixelData[1];
                        totalB += pixelData[2];
                        pixelCount++;
                    }
                } catch (e) {
                    console.error("Erro ao obter pixel data:", e);
                    alert("Erro ao ler pixel da imagem. Isso pode acontecer se a imagem for de uma fonte externa (online) ou estiver corrompida. Tente carregar uma imagem localmente salva.");
                    return; // Sai da função de clique se ocorrer um erro
                }
            }
        }

        if (pixelCount === 0) {
            alert("Não foi possível extrair a cor do pixel. Isso pode ocorrer se a área clicada for totalmente transparente ou fora da imagem. Tente clicar em outra área do poço.");
            return;
        }

        const avgR = Math.round(totalR / pixelCount);
        const avgG = Math.round(totalG / pixelCount);
        const avgB = Math.round(totalB / pixelCount);

        lastExtractedR = avgR;
        lastExtractedG = avgG;
        lastExtractedB = avgB;

        redInput.value = avgR;
        greenInput.value = avgG;
        blueInput.value = avgB;

        updateColorPreview(); // <<-- CHAMADA AQUI PARA ATUALIZAR A ESFERA DE PREVIEW MANUAL

        // Desenha um quadrado para representar a área de amostragem clicada
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - halfSampleSize, y - halfSampleSize, sampleSize, sampleSize);
    });

    redInput.addEventListener('input', updateColorPreview);
    greenInput.addEventListener('input', updateColorPreview);
    blueInput.addEventListener('input', updateColorPreview);

    calculateBtn.addEventListener('click', () => {
        // Garante que os parâmetros de interpolação estão atualizados antes do cálculo manual
        if (!updateInterpolationParameters()) {
            return; // Se houver erro na interpolação, interrompe
        }

        const results = calculateResults(parseFloat(redInput.value), parseFloat(greenInput.value), parseFloat(blueInput.value));
        fcManualResultSpan.textContent = results.FC;
        reductionManualResultSpan.textContent = `${results.Reduction}%`;
        if (!results.valid) {
            alert('Erro no cálculo manual: ' + results.Reduction.replace('Fórmula não aplicável', 'Valor de R=0.').replace('RGB Inválido', 'Valores RGB inválidos.'));
        }
    });

    addWellBtn.addEventListener('click', () => {
        addWellToList(lastExtractedR, lastExtractedG, lastExtractedB);
        calculateAverage();
    });

    clearWellsBtn.addEventListener('click', clearAllWells);
    calculateAverageBtn.addEventListener('click', calculateAverage);
    saveInterpolationBtn.addEventListener('click', updateInterpolationParameters);

    updateColorPreview(); // <<-- CHAMADA INICIAL AO CARREGAR A PÁGINA

    // Opcional: registrar Service Worker para PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/Calculadora-VITAKIT/service-worker.js')
                .then(registration => {
                    console.log('Service Worker registrado com sucesso:', registration);
                })
                .catch(error => {
                    console.log('Falha ao registrar Service Worker:', error);
                });
        });
    }
});