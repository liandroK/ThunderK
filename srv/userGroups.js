// userGroups.js
const cds = require('@sap/cds');

// Função para validar emails usando regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateEmail(email) {
    return emailRegex.test(email);
}

// Função para obter o groupId com base no userType
async function getGroupIdForUserType(userType, auth) {
    try {
        const response = await auth.send({
            method: 'GET',
            path: '/Groups',
            headers: {
                Accept: 'application/scim+json'
            }
        });

        const groups = response.Resources;
        if (!groups || groups.length === 0) {
            console.error("Nenhum grupo encontrado na resposta da API.");
            throw new Error("Nenhum grupo encontrado na resposta da API.");
        }

        // Procura o grupo certo com base no 'displayName' para 'vendor' ou 'approver'
        const group = groups.find(ger => {
            if (userType === 'vendor') {
                return ger.displayName === 'Vendedores';
            } else if (userType === 'approver') {
                return ger.displayName === 'Aprovadores';
            }
            return false;
        });

        if (!group) {
            console.error(`Nenhum grupo correspondente encontrado para o tipo de utilizador '${userType}'.`);
            return null;
        }
        return group.id;

    } catch (error) {
        console.error("Erro ao obter groupId:", error);
        throw new Error("Erro ao obter groupId.");
    }
}

// Função para criar utilizador na SAP e adicioná-lo ao grupo correspondente
async function createUserInSAP(email, userType, auth) {
    const [givenName, familyName] = email.includes('.')
        ? email.split('@')[0].split('.')
        : ['Name', 'Surname'];  // Definir um padrão caso o email não esteja no formato esperado

    const payload = {
        "schemas": [
            "urn:ietf:params:scim:schemas:core:2.0:User",
            "urn:ietf:params:scim:schemas:extension:sap:2.0:User"
        ],
        "userName": email,
        "name": {
            "givenName": givenName || '',
            "familyName": familyName || ''
        },
        "displayName": givenName,
        "userType": "public",
        "active": true,
        "emails": [
            {
                "value": email,
                "primary": true
            }
        ]
    };

    try {
        // Cria o utilizador
        const res = await auth.send({
            method: 'POST',
            path: '/Users',
            headers: {
                Accept: 'application/scim+json',
                'Content-Type': 'application/scim+json'
            },
            data: JSON.stringify(payload)
        });

        if (!res.id) throw new Error("Falha na criação do utilizador: ID ausente na resposta.");

        // Obter groupId para userType
        const groupId = await getGroupIdForUserType(userType, auth);
        if (!groupId) {
            throw new Error(`Group ID não encontrado para o tipo de utilizador '${userType}'.`);
        }

        // Adicionar utilizador ao grupo
        const userId = res.id;
        const groupPayload = {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [
                {
                    op: "add",
                    path: "members",
                    value: [{ value: userId }]
                }
            ]
        };

        await auth.send({
            method: 'PATCH',
            path: `/Groups/${groupId}`,
            headers: {
                Accept: 'application/scim+json',
                'Content-Type': 'application/scim+json'
            },
            data: JSON.stringify(groupPayload)
        });

        return res;

    } catch (error) {
        console.error('Erro ao criar ou adicionar utilizador ao grupo na API SAP:', error);
        throw new Error('Erro ao criar utilizador na API SAP.');
    }
}

// Função para obter utilizadores da API
async function getUsers() {
    try {
        const auth = await cds.connect.to('auth_api');
        const res = await auth.send({
            method: 'GET',
            path: '/Users',
            headers: {
                Accept: 'application/scim+json',
                'Content-Type': 'application/scim+json'
            }
        });

        // Formatar os dados dos utilizadores obtidos
        return (res.Resources || []).map(user => ({
            userName: user.userName || '',
            givenName: user.name?.givenName || '',
            familyName: user.name?.familyName || '',
            email: user.emails?.[0]?.value || ''
        }));
    } catch (error) {
        console.error('Erro ao obter utilizadores:', error);
        throw new Error('Erro ao obter utilizadores da API.');
    }
}

module.exports = {
    validateEmail,
    getGroupIdForUserType,
    createUserInSAP,
    getUsers
};
