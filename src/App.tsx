import * as React from 'react';
import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Column from './components/Column';
import Wrapper from './components/Wrapper';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';
import Button from './components/Button';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData } from './helpers/utilities';

import {
    LIBRARY_ADDRESS
} from './constants';
import { getContract } from './helpers/ethers';
import LIBRARY from './constants/abis/Library.json';

const SLayout = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SLanding = styled(Column)`
  height: 600px;
`;

// @ts-ignore
const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

interface IAppState {
    fetching: boolean;
    address: string;
    library: any;
    connected: boolean;
    chainId: number;
    pendingRequest: boolean;
    result: any | null;
    libraryContract: any | null;
    info: any | null;
    transactionHash: string | null;
    form: any | null;
    allAvailableBooks: IBook[];
}

interface IBook {
    id: number;
    name: string;
    copies: number;
}

const INITIAL_STATE: IAppState = {
    fetching: false,
    address: '',
    library: null,
    connected: false,
    chainId: 1,
    pendingRequest: false,
    result: null,
    libraryContract: null,
    info: null,
    transactionHash: '',
    form: {
        bookName: "",
        bookCopies: 0,
    },
    allAvailableBooks: []
};

class App extends React.Component<any, any> {
    // @ts-ignore
    public web3Modal: Web3Modal;
    public state: IAppState;
    public provider: any;

    constructor(props: any) {
        super(props);
        this.state = {
            ...INITIAL_STATE
        };

        this.web3Modal = new Web3Modal({
            network: this.getNetwork(),
            cacheProvider: true,
            providerOptions: this.getProviderOptions()
        });
    }

    public componentDidMount() {
        if (this.web3Modal.cachedProvider) {
            this.onConnect();
        }
    }

    public onConnect = async () => {
        this.provider = await this.web3Modal.connect();

        const library = new Web3Provider(this.provider);

        const network = await library.getNetwork();

        const address = this.provider.selectedAddress ? this.provider.selectedAddress : this.provider?.accounts[0];

        const libraryContract = getContract(LIBRARY_ADDRESS, LIBRARY.abi, library, address);

        await this.setState({
            library,
            chainId: network.chainId,
            address,
            connected: true,
            libraryContract
        });

        await this.subscribeToProviderEvents(this.provider);

        // await this.getAvailableBooks();
    };

    public subscribeToProviderEvents = async (provider: any) => {
        if (!provider.on) {
            return;
        }

        provider.on("accountsChanged", this.changedAccount);
        provider.on("networkChanged", this.networkChanged);
        provider.on("close", this.close);

        await this.web3Modal.off('accountsChanged');
    };

    public async unSubscribe(provider: any) {
        // Workaround for metamask widget > 9.0.3 (provider.off is undefined);
        window.location.reload(false);
        if (!provider.off) {
            return;
        }

        provider.off("accountsChanged", this.changedAccount);
        provider.off("networkChanged", this.networkChanged);
        provider.off("close", this.close);
    }

    public changedAccount = async (accounts: string[]) => {
        if (!accounts.length) {
            // Metamask Lock fire an empty accounts array
            await this.resetApp();
        } else {
            await this.setState({ address: accounts[0] });
        }
    }

    public networkChanged = async (networkId: number) => {
        const library = new Web3Provider(this.provider);
        const network = await library.getNetwork();
        const chainId = network.chainId;
        await this.setState({ chainId, library });
    }

    public close = async () => {
        this.resetApp();
    }

    public getNetwork = () => getChainData(this.state.chainId).network;

    public getProviderOptions = () => {
        const providerOptions = {
            walletconnect: {
                package: WalletConnectProvider,
                options: {
                    infuraId: process.env.REACT_APP_INFURA_ID
                }
            }
        };
        return providerOptions;
    };

    public resetApp = async () => {
        await this.web3Modal.clearCachedProvider();
        localStorage.removeItem("WEB3_CONNECT_CACHED_PROVIDER");
        localStorage.removeItem("walletconnect");
        await this.unSubscribe(this.provider);

        this.setState({ ...INITIAL_STATE });

    };

    public submitAddBook = async () => {
        const { libraryContract } = this.state;
        const { bookName, bookCopies } = this.state.form;

        await this.setState({ fetching: true });

        const transaction = await libraryContract.addBook(bookName, parseInt(bookCopies, 10));

        await this.setState({ transactionHash: transaction.hash });

        const transactionReceipt = await transaction.wait();

        if (transactionReceipt.status !== 1) {
            console.log("Failed transaction");
        }

        await this.setState({ fetching: false });
    };

    public borrowBook = async (event: any) => {
        const { libraryContract } = this.state;
        const bookId = event.target.dataset.bookId;
        await this.setState({ fetching: true });

        const transaction = await libraryContract.borrowBook(bookId);

        await this.setState({ transactionHash: transaction.hash });

        const transactionReceipt = await transaction.wait();

        if (transactionReceipt.status !== 1) {
            console.log("Failed transaction");
        }

        await this.setState({ fetching: false });
    }

    public returnBook = async (event: any) => {
        const { libraryContract } = this.state;
        const bookId = event.target.dataset.bookId;
        await this.setState({ fetching: true });

        const transaction = await libraryContract.returnBook(bookId);

        await this.setState({ transactionHash: transaction.hash });

        const transactionReceipt = await transaction.wait();

        if (transactionReceipt.status !== 1) {
            console.log("Failed transaction");
        }

        await this.setState({ fetching: false });
    }

    public handleInputChange = async (event: any) => {
        const { name, value } = event.target;
        await this.setState({ form: { ...this.state.form, [name]: value } });
    }

    public getAvailableBooks = async () => {
        const { libraryContract } = this.state;

        await this.setState({ fetching: true });

        const allBooksLength = parseInt(await libraryContract.getBooksLength(), 10)

        const allAvailableBooks = []

        for (let i = 0; i < allBooksLength; i++) {
            const bookId = await libraryContract.booksId(i)
            const { name, copies } = await libraryContract.booksInLibrary(bookId)
            const book = {
                id: bookId.toString(),
                name,
                copies
            };

            if (copies > 0) {
                allAvailableBooks.push(book)
            }
        }

        console.log(allAvailableBooks);

        await this.setState({
            allAvailableBooks,
            fetching: false,
        });
    }

    public getBooksByUser = async () => {
        const { libraryContract, address } = this.state;
        await this.setState({ fetching: true });

        const allBooksLength = parseInt(await libraryContract.getBooksLength(), 10)

        const allBorrowed = []

        for (let i = 0; i < allBooksLength; i++) {
            const bookId = await libraryContract.booksId(i)
            const { name, copies } = await libraryContract.booksInLibrary(bookId)
            const book = {
                id: bookId.toString(),
                name,
                copies
            };

            if (await libraryContract.borrowedBooksByUser(address, bookId)) {
                allBorrowed.push(book)
            }
        }

        console.log(allBorrowed);

        await this.setState({ fetching: false });
    }

    public renderBooks = async () => {
        const books = this.state.allAvailableBooks.map((b: any) => (`
            <div>
                ${b.name}
            </div>
        `));

        return books;
    }

    public render = () => {
        const {
            address,
            connected,
            chainId,
            fetching,
            transactionHash,
            allAvailableBooks
        } = this.state;
        return (
            <SLayout>
                <Column maxWidth={1000} spanHeight>
                    <Header
                        connected={connected}
                        address={address}
                        chainId={chainId}
                        killSession={this.resetApp}
                    />
                    <SContent>
                        {fetching ? (
                            <Column center>
                                <SContainer>
                                    <Loader />
                                </SContainer>
                                {transactionHash && (
                                    <div>
                                        <p>Transaction hash: <a target="_blank" href={`https://ropsten.etherscan.io/tx/${transactionHash}`}>transactionHash</a></p>
                                    </div>
                                )}
                            </Column>
                        ) : (
                            <SLanding center>
                                {!this.state.connected && <ConnectButton onClick={this.onConnect} />}
                                <div className="text-left">
                                    <form action="">
                                        <div className="form-group">
                                            <label className="form-label">Book name</label>
                                            <input value={this.state.form.state} onChange={this.handleInputChange} className="form-control" type="text" name="bookName" />
                                        </div>

                                        <div className="form-group mt-5">
                                            <label className="form-label">Book copies</label>
                                            <input value={this.state.form.trumpVotes} onChange={this.handleInputChange} className="form-control" type="number" name="bookCopies" />
                                        </div>
                                    </form>

                                    <div className="mt-5">
                                        <Button onClick={this.submitAddBook}>Add book</Button>
                                    </div>
                                </div>

                                <div className="mt-5">
                                    <Button onClick={this.getAvailableBooks}>Get available books</Button>
                                    <Button onClick={this.getBooksByUser}>Get books by user</Button>
                                </div>

                                <div className="text-left mt-5">
                                    {allAvailableBooks && allAvailableBooks.length > 0 ? this.renderBooks() : 'No books available!'}
                                    {/* <p data-book-id="0x60d7b6fed2ea95de57c8ef53c3b2808dda26ae0506158186f67e7dcc03bfb537" onClick={this.borrowBook}>
                                        Book 1
                                    </p>
                                    <p data-book-id="0xf2821cbf42868fd2036b83a332b15f771318e36dee06df6f0517790824ccf740" onClick={this.borrowBook}>
                                        Book 2
                                    </p>
                                    <p data-book-id="0x6bde7124d2fb8d0ce9595073fd37441b7ad5aff3b7e06181ff6ccd09a805a13f">
                                        Book 3
                                    </p> */}
                                </div>
                            </SLanding>
                        )}
                    </SContent>
                </Column>
            </SLayout >
        );
    };
}

export default App;
