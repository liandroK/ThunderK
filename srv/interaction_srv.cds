using app.salesK from '../db/interactions';
using V_GETSALESAPPROVER from '../db/interactions';

service Sales.service {

    type Email: String(320);

    type User {
        id: String;
        userName: String(100);
        givenName: String(100);
        familyName: String(100);
        email: String(320);
    }

    type Sales {
        email_comprador: Email;
        email_vendor: Email;
        items: many SalesItems;  
    };

    type SalesItems {
        material: UUID;
        qtd: Integer;
    };

    type SalesOrderResponse {
        salesID: String(10);
        status: String(255);
        message: String(1024);
    };

    @odata.draft.bypass: true
    entity aprovadores as projection on salesK.Approvers;
    
    @odata.draft.bypass: true
    entity artigos as select from salesK.Materials;

    @readonly: true
    entity sales as projection on salesK.Sales;
    
    @readonly: true
    entity salesItems as projection on salesK.SalesItems;

    @readonly: true
    entity getSaleApprover as projection on V_GETSALESAPPROVER;

    action getUsers() returns array of User;

    action createUserInSAP(email: Email, userType: String) returns User;

    function getSalesForPerson(email: Email) returns array of Sales;
  
    function create_salesorder(sales: Sales) returns SalesOrderResponse;

    action updateStatus(id: Integer, status: String) returns Boolean;

    action validateApprovers(vendor: Email, approver: Email) returns Boolean;
}
